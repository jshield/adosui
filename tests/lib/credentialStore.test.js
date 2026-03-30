import { describe, it, expect } from 'vitest';

describe('credentialStore exports', () => {
  it('should export credential store functions', async () => {
    const mod = await import('../../src/lib/credentialStore.js');
    expect(mod.isPRFAvailable).toBeDefined();
    expect(typeof mod.isPRFAvailable).toBe('function');
  });

  it('should export conflict error from storage', async () => {
    const mod = await import('../../src/lib/adoStorage.js');
    expect(mod.ConflictError).toBeDefined();
  });
});

describe('ADOStorage class', () => {
  it('should export ConflictError', async () => {
    const { ConflictError } = await import('../../src/lib/adoStorage.js');
    expect(ConflictError).toBeDefined();
    expect(new ConflictError('test')).toBeInstanceOf(Error);
  });
});