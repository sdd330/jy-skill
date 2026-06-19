import { describe, it, expect } from 'vitest';
import { validatePack } from './validate-pack';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validate-pack', () => {
  it('packs and verifies skill zip with required entries', () => {
    const { ok, errors } = validatePack(ROOT);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  }, 30_000);
});
