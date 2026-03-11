/**
 * credentialStore.js
 *
 * Encrypts and stores the ADO Personal Access Token (PAT) in the browser.
 *
 * Two modes:
 * 1. FIDO2 PRF (HMAC-secret) — Uses a WebAuthn authenticator's PRF extension to
 *    derive an AES-256 key. The private key never leaves the hardware authenticator.
 *    Supported in Chrome 132+, Firefox/Safari coming.
 *
 * 2. Passphrase (PBKDF2) — Fallback for browsers without PRF support. The PAT is
 *    encrypted using a key derived from the user's passphrase (310k iterations).
 *
 * Both modes:
 *   - Ciphertext and IV are stored in localStorage under `ado-superui-credentials`
 *   - The derived AES key is cached in sessionStorage (per-tab) for page refreshes
 *   - On disconnect (explicit logout), all localStorage is wiped
 */

import HKDF from "hkdf";
import { base64, hex } from "./encoding";

// Storage keys
const STORAGE_KEY = "ado-superui-credentials";
const SESSION_KEY = "ado-superui-session-key"; // cached AES-GCM CryptoKey

// Crypto defaults
const HKDF_SALT = new Uint8Array(0);
const HKDF_INFO = new TextEncoder().encode("ado-superui-v1");
const PBKDF2_ITERATIONS = 310_000;

/**
 * Derive AES-GCM key from PRF output using HKDF.
 */
async function deriveAesKeyFromPRF(prfOutputBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfOutputBytes,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive AES-GCM key from passphrase using PBKDF2.
 */
async function deriveAesKeyFromPassphrase(passphrase, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using the supplied AES-GCM CryptoKey.
 */
async function encrypt(pat, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(pat)
  );
  return {
    ciphertext: base64.fromUint8Array(new Uint8Array(cipherBuffer)),
    iv: base64.fromUint8Array(iv),
  };
}

/**
 * Decrypt data using the supplied AES-GCM CryptoKey.
 */
async function decrypt(ciphertext, iv, aesKey) {
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64.toUint8Array(iv) },
    aesKey,
    base64.toUint8Array(ciphertext)
  );
  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Check if PRF extension is supported.
 */
export async function isPRFAvailable() {
  try {
    const caps = await PublicKeyCredential.getClientCapabilities();
    return !!caps.prf;
  } catch {
    return false;
  }
}

/**
 * Register a new FIDO2 credential with PRF enabled.
 * Returns the stored credential info.
 */
export async function registerFIDO2Credential(org) {
  // Generate a unique user ID for this credential
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const prfSalt = crypto.getRandomValues(new Uint8Array(16));

  const options = {
    publicKey: {
      rp: {
        id: window.location.hostname,
        name: "ADO SuperUI"
      },
      user: {
        id: userId,
        name: `ado-superui-${org}`,
        displayName: `ADO SuperUI (${org})`
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { userVerification: "preferred" },
      timeout: 60000,
      extensions: { prf: { enabled: true } }
    }
  };

  const credential = await navigator.credentials.create(options);
  const credentialId = base64.fromUint8Array(new Uint8Array(credential.rawId));

  return {
    credentialId,
    prfSalt: base64.fromUint8Array(prfSalt),
    authMode: "prf"
  };
}

/**
 * Get PRF output from the authenticator for encryption/decryption.
 * Optionally takes a cached credentialId to invoke the specific key.
 */
export async function getPRFOutput(credentialId, prfSalt) {
  const options = {
    publicKey: {
      rpId: window.location.hostname,
      allowCredentials: [{
        type: "public-key",
        id: base64.toUint8Array(credentialId)
      }],
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: "preferred",
      timeout: 60000,
      extensions: { prf: { eval: { first: base64.toUint8Array(prfSalt) } } }
    }
  };

  const assertion = await navigator.credentials.get(options);
  const results = assertion.getClientExtensionResults();
  const prfOutput = results.prf?.results?.first;

  if (!prfOutput || prfOutput.byteLength < 32) {
    throw new Error("PRF output not available or insufficient length");
  }

  return new Uint8Array(prfOutput);
}

/**
 * Encrypt PAT and persist to localStorage.
 * Works in both PRF and passphrase modes.
 */
export async function persistPAT(pat, data) {
  // data = { authMode, org, credentialId?, prfSalt?, passphrase? }
  let aesKey;
  let authInfo = { authMode: data.authMode, org: data.org };

  if (data.authMode === "prf") {
    const prfOut = await getPRFOutput(data.credentialId, data.prfSalt);
    aesKey = await deriveAesKeyFromPRF(prfOut);
    authInfo.credentialId = data.credentialId;
    authInfo.prfSalt = data.prfSalt;
  } else {
    // Passphrase mode — need the passphrase to derive the key
    if (!data.passphrase) throw new Error("Passphrase required for passphrase mode");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    aesKey = await deriveAesKeyFromPassphrase(data.passphrase, salt);
    authInfo.salt = base64.fromUint8Array(salt);
  }

  const { ciphertext, iv } = await encrypt(pat, aesKey);
  authInfo.ciphertext = ciphertext;
  authInfo.iv = iv;

  // Persist to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(authInfo));

  // Cache AES key in sessionStorage for page refreshes
  cacheSessionKey(aesKey);
}

/**
 * Load and decrypt the PAT from localStorage.
 * If AES key is cached in sessionStorage, uses it directly.
 * Otherwise, re-derives from PRF or passphrase.
 */
export async function loadPAT(passphrase) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  const data = JSON.parse(stored);
  let aesKey;

  // 1. Try session key cache first (for PRF mode)
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (cached) {
    const imported = await crypto.subtle.importKey(
      "raw",
      base64.toUint8Array(cached),
      "AES-GCM",
      true,
      ["decrypt"]
    );
    try {
      const pat = await decrypt(data.ciphertext, data.iv, imported);
      return { pat, data };
    } catch {
      // Cached key failed — re-derive below
    }
  }

  // 2. Re-derive key based on authMode
  if (data.authMode === "prf") {
    const prfOut = await getPRFOutput(data.credentialId, data.prfSalt);
    aesKey = await deriveAesKeyFromPRF(prfOut);
  } else {
    if (!passphrase) throw new Error("Passphrase required for passphrase mode");
    const salt = base64.toUint8Array(data.salt);
    aesKey = await deriveAesKeyFromPassphrase(passphrase, salt);
  }

  const pat = await decrypt(data.ciphertext, data.iv, aesKey);
  cacheSessionKey(aesKey);
  return { pat, data };
}

/**
 * Update the stored PAT with a new value (re-encrypts with existing key).
 * Used for the "Update PAT" feature in the Rail.
 */
export async function updatePAT(newPat) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) throw new Error("No credentials stored to update");

  const data = JSON.parse(stored);
  let aesKey;

  // Use cached session key if available (fast path)
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (cached) {
    const imported = await crypto.subtle.importKey(
      "raw",
      base64.toUint8Array(cached),
      "AES-GCM",
      true,
      ["encrypt"]
    );
    await persistPATWithKey(newPat, data, imported);
    return;
  }

  // Re-derive key for PRF or passphrase mode
  if (data.authMode === "prf") {
    const prfOut = await getPRFOutput(data.credentialId, data.prfSalt);
    aesKey = await deriveAesKeyFromPRF(prfOut);
  } else {
    // For passphrase mode, we'd need to prompt for the passphrase again.
    // Since this is called from the Rail footer, we ask the UI to handle re-prompt.
    throw new Error("Passphrase required");
  }

  await persistPATWithKey(newPat, data, aesKey);
}

/**
 * Internal: persist with pre-derived AES key.
 */
async function persistPATWithKey(pat, baseInfo, aesKey) {
  const { ciphertext, iv } = await encrypt(pat, aesKey);
  const info = {
    ...baseInfo,
    ciphertext,
    iv
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  cacheSessionKey(aesKey);
}

/**
 * Cache the AES key in sessionStorage for page refreshes.
 */
function cacheSessionKey(aesKey) {
  crypto.subtle.exportKey("raw", aesKey).then(raw => {
    sessionStorage.setItem(SESSION_KEY, base64.fromUint8Array(new Uint8Array(raw)));
  });
}

/**
 * Clear the cached session key (e.g. on explicit logout).
 */
export function clearSessionKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Check if we have stored credentials.
 */
export function hasStoredCredentials() {
  return !!localStorage.getItem(STORAGE_KEY);
}

/**
 * Get the auth mode of the stored credentials (if any).
 */
export function getStoredAuthMode() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored);
    return data.authMode;
  } catch {
    return null;
  }
}

/**
 * Get the stored org name (if any).
 */
export function getStoredOrg() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored);
    return data.org;
  } catch {
    return null;
  }
}

/**
 * Wipe all credentials and session keys.
 * Note: This clears all localStorage for the origin (as per decision).
 */
export function clearCredentials() {
  // Clear entire localStorage to be safe
  localStorage.clear();
  sessionStorage.removeItem(SESSION_KEY);
}
