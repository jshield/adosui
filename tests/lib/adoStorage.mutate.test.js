import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '../../src/lib/adoStorage.js';

describe('ADOStorage storage class', () => {
  it('should export ConflictError class', () => {
    expect(ConflictError).toBeDefined();
    expect(new ConflictError('message')).toBeInstanceOf(Error);
  });

  it('ConflictError should store message', () => {
    const err = new ConflictError('Version conflict');
    expect(err.message).toBe('Version conflict');
  });
});

describe('ADOStorage methods exist', () => {
  let clientMock;

  beforeEach(() => {
    clientMock = {
      testConnection: vi.fn(),
    };
  });

  it('should expose save method on storage instance', async () => {
    const { ADOStorage } = await import('../../src/lib/adoStorage.js');
    const storage = new ADOStorage(
      clientMock,
      { project: 'P', repoId: 'r', repoName: 'n', branch: 'main' },
      { id: 'u1', displayName: 'User' }
    );
    expect(typeof storage.save).toBe('function');
  });
});