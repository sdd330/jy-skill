import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const ZIP_NAME = 'jy-skill.zip';
const ZIP_PATH = join(ROOT, ZIP_NAME);

const REQUIRED_ENTRIES = ['SKILL.md', 'scripts/game-engine.ts', 'assets/templates.json'];
const FORBIDDEN_PREFIXES = ['node_modules/', 'coverage/', '.git/', '.github/'];

function shouldInclude(relativePath) {
  if (!relativePath || relativePath === ZIP_NAME) return false;
  if (relativePath.startsWith('node_modules/')) return false;
  if (relativePath.startsWith('coverage/')) return false;
  if (relativePath.startsWith('.git/')) return false;
  if (relativePath.startsWith('.github/')) return false;
  if (relativePath.startsWith('.vitest/')) return false;
  if (relativePath === 'save/game-state.json') return false;
  if (relativePath.endsWith('.log')) return false;
  if (relativePath.endsWith('.DS_Store')) return false;
  return true;
}

function listFiles() {
  const output = execSync('find . -type f', { cwd: ROOT, encoding: 'utf-8' });
  return output
    .split('\n')
    .map((line) => line.replace(/^\.\//, ''))
    .filter(shouldInclude);
}

function pack() {
  if (existsSync(ZIP_PATH)) {
    unlinkSync(ZIP_PATH);
  }

  const files = listFiles();
  const listFile = join(tmpdir(), `jy-skill-files-${process.pid}.txt`);
  writeFileSync(listFile, files.join('\n'));

  try {
    execSync(`zip -q -r ${ZIP_NAME} -@ < ${listFile}`, {
      cwd: ROOT,
      shell: '/bin/bash',
      stdio: 'inherit',
    });
  } finally {
    unlinkSync(listFile);
  }

  console.log(`Created ${ZIP_NAME} (${files.length} files)`);
}

function verify() {
  if (!existsSync(ZIP_PATH)) {
    console.error(`Missing ${ZIP_NAME}; run pack first`);
    process.exit(1);
  }

  const listing = execSync(`unzip -Z1 ${ZIP_NAME}`, { cwd: ROOT, encoding: 'utf-8' });
  const entries = listing.split('\n').filter(Boolean);

  for (const required of REQUIRED_ENTRIES) {
    const found = entries.some((entry) => entry === required || entry.endsWith(`/${required}`));
    if (!found) {
      console.error(`Missing required file in zip: ${required}`);
      process.exit(1);
    }
  }

  for (const entry of entries) {
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (entry === prefix.slice(0, -1) || entry.startsWith(prefix)) {
        console.error(`Forbidden path in zip: ${entry}`);
        process.exit(1);
      }
    }
  }

  console.log(`Verified ${ZIP_NAME} (${entries.length} entries)`);
}

const mode = process.argv.includes('--verify') ? 'verify' : 'pack';

if (mode === 'verify') {
  verify();
} else {
  pack();
}
