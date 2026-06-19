import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillMd } from './validate-skill';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validate-skill', () => {
  it('validates project SKILL.md without errors', () => {
    const { ok, errors } = validateSkillMd(SKILL_ROOT);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });
});
