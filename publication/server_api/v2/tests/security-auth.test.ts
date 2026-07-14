import { describe, test, expect } from 'bun:test';
import { validateApiKey } from '../src/security/auth';
import { UnauthorizedError } from '../src/errors';

const req = (key?: string) =>
  new Request('http://localhost/x', key ? { headers: { 'X-API-Key': key } } : {});

describe('validateApiKey', () => {
  test('passes when no keys are configured (open access)', async () => {
    await expect(validateApiKey(req(), [])).resolves.toBeUndefined();
    await expect(validateApiKey(req('anything'), [])).resolves.toBeUndefined();
  });

  test('rejects missing key when keys are configured', async () => {
    await expect(validateApiKey(req(), ['secret'])).rejects.toThrow(UnauthorizedError);
  });

  test('rejects invalid key', async () => {
    await expect(validateApiKey(req('wrong'), ['secret'])).rejects.toThrow(UnauthorizedError);
    // same length but different content (timing-safe comparison path)
    await expect(validateApiKey(req('secre7'), ['secret'])).rejects.toThrow(UnauthorizedError);
  });

  test('accepts a valid key from the list', async () => {
    await expect(validateApiKey(req('secret'), ['other', 'secret'])).resolves.toBeUndefined();
  });
});
