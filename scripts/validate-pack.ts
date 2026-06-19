/**
 * Skill 打包与 zip 内容校验
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZIP_NAME = 'jy-skill.zip';

export interface PackValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePack(rootDir: string): PackValidationResult {
  const errors: string[] = [];
  const packScript = join(rootDir, 'scripts/pack-skill.mjs');
  const zipPath = join(rootDir, ZIP_NAME);

  if (!existsSync(packScript)) {
    return { ok: false, errors: ['scripts/pack-skill.mjs not found'] };
  }

  try {
    execSync('node scripts/pack-skill.mjs', { cwd: rootDir, stdio: 'pipe', encoding: 'utf-8' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Pack failed: ${message}`);
    return { ok: false, errors };
  }

  if (!existsSync(zipPath)) {
    errors.push(`${ZIP_NAME} was not created`);
    return { ok: false, errors };
  }

  try {
    execSync('node scripts/pack-skill.mjs --verify', {
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Verify failed: ${message}`);
  } finally {
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main(): void {
  const rootDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { ok, errors } = validatePack(rootDir);

  if (ok) {
    console.log('OK — skill pack and zip verification passed');
    process.exit(0);
  }

  console.error(`Found ${errors.length} pack error(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
