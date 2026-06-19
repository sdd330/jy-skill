/**
 * package.json 与 SKILL.md metadata.version 一致性校验
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VersionValidationResult {
  ok: boolean;
  errors: string[];
  packageVersion?: string;
  skillVersion?: string;
}

export function getSkillMetadataVersion(skillMdContent: string): string | null {
  const match = skillMdContent.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!match) return null;

  const frontmatter = match[0];
  const inMetadata = frontmatter.match(/metadata:[\s\S]*?^\s*version:\s*["']?([^"'\n]+)["']?\s*$/m);
  return inMetadata?.[1]?.trim() ?? null;
}

export function validateVersions(rootDir: string): VersionValidationResult {
  const errors: string[] = [];

  const pkgPath = join(rootDir, 'package.json');
  const skillPath = join(rootDir, 'SKILL.md');

  let packageVersion: string | undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    packageVersion = pkg.version;
    if (!packageVersion) {
      errors.push('package.json missing version field');
    }
  } catch {
    errors.push('Failed to read or parse package.json');
  }

  let skillVersion: string | null = null;
  try {
    const skillContent = readFileSync(skillPath, 'utf-8');
    skillVersion = getSkillMetadataVersion(skillContent);
    if (!skillVersion) {
      errors.push('SKILL.md missing metadata.version in frontmatter');
    }
  } catch {
    errors.push('Failed to read SKILL.md');
  }

  if (packageVersion && skillVersion && packageVersion !== skillVersion) {
    errors.push(
      `Version mismatch: package.json is ${packageVersion}, SKILL.md metadata.version is ${skillVersion}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    packageVersion,
    skillVersion: skillVersion ?? undefined,
  };
}

function main(): void {
  const rootDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { ok, errors, packageVersion, skillVersion } = validateVersions(rootDir);

  if (ok) {
    console.log(`OK — versions aligned at ${packageVersion} (package.json & SKILL.md)`);
    process.exit(0);
  }

  console.error(`Found ${errors.length} version error(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  if (packageVersion || skillVersion) {
    console.error(`  package.json: ${packageVersion ?? '—'}, SKILL.md: ${skillVersion ?? '—'}`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
