import { describe, it, expect } from 'vitest';
import { validateDocs, collectMarkdownLinks } from './validate-docs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validate-docs', () => {
  it('validates project documentation without errors', () => {
    const { ok, errors } = validateDocs(ROOT);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('collects relative markdown links', () => {
    const links = collectMarkdownLinks('[a](references/foo.md) [b](https://x.com) [c](#x)');
    expect(links).toEqual(['references/foo.md']);
  });
});
