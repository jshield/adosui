import { beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock crypto.subtle for credentialStore tests
const mockCrypto = {
  subtle: {
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
};

beforeAll(() => {
  // Mock global crypto
  global.crypto = mockCrypto;
  global.crypto.subtle = mockCrypto.subtle;

  // Mock localStorage
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i] || null },
    };
  })();

  Object.defineProperty(global, 'localStorage', { value: localStorageMock });

  // Mock sessionStorage
  const sessionStorageMock = (() => {
    let store = {};
    return {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i] || null },
    };
  })();

  Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

  // Mock console.error and console.warn to track calls (optional silencing in tests)
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});