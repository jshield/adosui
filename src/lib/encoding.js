/**
 * encoding.js
 *
 * Minimal base64 helpers for localStorage and crypto operations.
 */

// Base64 URL-safe (no padding, - instead of +, _ instead of /)
export const base64 = {
  fromUint8Array(arr) {
    const str = btoa(String.fromCharCode(...arr));
    return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  },
  toUint8Array(str) {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const binary = atob(normalized);
    return new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
  },
};

// Hex (for debug / legacy compat)
export const hex = {
  fromUint8Array(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  },
  toUint8Array(str) {
    const arr = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length; i += 2) {
      arr[i / 2] = parseInt(str.substr(i, 2), 16);
    }
    return arr;
  },
};
