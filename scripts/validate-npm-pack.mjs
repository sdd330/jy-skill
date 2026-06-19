/**
 * 校验 npm pack  tarball 内容符合 skill 发布要求
 */

import { execSync } from 'node:child_process';

const REQUIRED_ENTRIES = [
  'SKILL.md',
  'AGENTS.md',
  'LICENSE',
  'scripts/game-engine.ts',
  'scripts/install-skill.mjs',
  'assets/templates.json',
  'references/agent-handbook.md',
  'references/player-guide.md',
  'save/.gitkeep',
];

const FORBIDDEN_PATTERNS = [
  /\.test\.ts$/,
  /^\.github\//,
  /^coverage\//,
  /^node_modules\//,
  /^vite\.config\.ts$/,
];

function normalizeEntry(entry) {
  return entry.replace(/^package\//, '');
}

function main() {
  const raw = execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf-8' });
  const parsed = JSON.parse(raw);
  const packResult = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = (packResult.files ?? []).map((f) => normalizeEntry(f.path ?? f));

  const errors = [];

  for (const required of REQUIRED_ENTRIES) {
    const found = files.some((f) => f === required || f.endsWith(`/${required}`));
    if (!found) {
      errors.push(`Missing required file in npm pack: ${required}`);
    }
  }

  for (const file of files) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(file)) {
        errors.push(`Forbidden file in npm pack: ${file}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Found ${errors.length} npm pack error(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`OK — npm pack valid (${files.length} files)`);
}

main();
