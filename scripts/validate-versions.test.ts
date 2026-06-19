import { describe, it, expect } from 'vitest';
import { validateVersions, getSkillMetadataVersion } from './validate-versions';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validate-versions', () => {
  it('validates project versions are aligned', () => {
    const { ok, errors, packageVersion, skillVersion } = validateVersions(ROOT);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
    expect(packageVersion).toBe('0.3.1');
    expect(skillVersion).toBe('0.3.1');
  });

  it('extracts metadata.version from frontmatter', () => {
    const content = `---
name: test
metadata:
  version: "1.2.3"
---
`;
    expect(getSkillMetadataVersion(content)).toBe('1.2.3');
  });

  it('returns null when metadata.version is missing', () => {
    expect(getSkillMetadataVersion('---\nname: x\n---\n')).toBeNull();
  });
});
