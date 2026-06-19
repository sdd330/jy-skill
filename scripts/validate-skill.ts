/**
 * SKILL.md frontmatter 校验 — CI / 本地验证
 *
 * 规则对齐 OpenClaw quick_validate.py
 * 用法: npx tsx scripts/validate-skill.ts [skillDir]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_NAME_LENGTH = 64;
const MAX_DESC_LENGTH = 1024;

const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
  'disable-model-invocation',
]);

export interface SkillValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSkillMd(skillDir: string): SkillValidationResult {
  const errors: string[] = [];
  const skillMdPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    return { ok: false, errors: ['SKILL.md not found'] };
  }

  const content = readFileSync(skillMdPath, 'utf8');
  if (!content.startsWith('---')) {
    errors.push('No YAML frontmatter found');
    return { ok: false, errors };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push('Invalid frontmatter format');
    return { ok: false, errors };
  }

  const frontmatter = parseFrontmatter(match[1]);
  if (!frontmatter) {
    errors.push('Invalid YAML in frontmatter');
    return { ok: false, errors };
  }

  const unexpected = Object.keys(frontmatter).filter((k) => !ALLOWED_KEYS.has(k));
  if (unexpected.length > 0) {
    errors.push(
      `Unexpected key(s) in SKILL.md frontmatter: ${unexpected.toSorted().join(', ')}. ` +
        `Allowed: ${[...ALLOWED_KEYS].toSorted().join(', ')}`,
    );
  }

  if (!('name' in frontmatter)) {
    errors.push("Missing 'name' in frontmatter");
  }
  if (!('description' in frontmatter)) {
    errors.push("Missing 'description' in frontmatter");
  }

  const name = frontmatter.name;
  if (name !== undefined) {
    if (typeof name !== 'string') {
      errors.push(`Name must be a string, got ${typeof name}`);
    } else {
      const trimmed = name.trim();
      if (trimmed && !/^[a-z0-9-]+$/.test(trimmed)) {
        errors.push(
          `Name '${trimmed}' should be hyphen-case (lowercase letters, digits, and hyphens only)`,
        );
      }
      if (trimmed && (trimmed.startsWith('-') || trimmed.endsWith('-') || trimmed.includes('--'))) {
        errors.push(
          `Name '${trimmed}' cannot start/end with hyphen or contain consecutive hyphens`,
        );
      }
      if (trimmed.length > MAX_NAME_LENGTH) {
        errors.push(
          `Name is too long (${trimmed.length} characters). Maximum is ${MAX_NAME_LENGTH}`,
        );
      }
    }
  }

  const description = frontmatter.description;
  if (description !== undefined) {
    if (typeof description !== 'string') {
      errors.push(`Description must be a string, got ${typeof description}`);
    } else {
      const trimmed = description.trim();
      if (trimmed.includes('<') || trimmed.includes('>')) {
        errors.push('Description cannot contain angle brackets (< or >)');
      }
      if (trimmed.length > MAX_DESC_LENGTH) {
        errors.push(
          `Description is too long (${trimmed.length} characters). Maximum is ${MAX_DESC_LENGTH}`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 解析 SKILL.md 常用 frontmatter（支持 >- 折叠字符串与 metadata 嵌套） */
function parseFrontmatter(text: string): Record<string, unknown> | null {
  try {
    const result: Record<string, unknown> = {};
    const lines = text.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const keyMatch = line.match(/^([a-zA-Z0-9-]+):\s*(.*)$/);
      if (!keyMatch) {
        i++;
        continue;
      }

      const [, key, rest] = keyMatch;
      i++;

      if (rest === '>-' || rest === '|' || rest === '|-') {
        const block: string[] = [];
        while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
          if (lines[i].startsWith('  ')) {
            block.push(lines[i].slice(2));
          } else if (block.length > 0) {
            block.push('');
          }
          i++;
        }
        result[key] = block.join('\n').trimEnd();
        continue;
      }

      if (rest === '') {
        if (key === 'metadata') {
          const meta: Record<string, unknown> = {};
          while (i < lines.length && lines[i].match(/^  [a-zA-Z0-9-]+:/)) {
            const metaMatch = lines[i].match(/^  ([a-zA-Z0-9-]+):\s*(.*)$/);
            if (metaMatch) {
              meta[metaMatch[1]] = unquote(metaMatch[2]);
            }
            i++;
          }
          result[key] = meta;
          continue;
        }
        continue;
      }

      result[key] = unquote(rest);
    }

    return result;
  } catch {
    return null;
  }
}

function unquote(value: string): string | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function main(): void {
  const skillDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { ok, errors } = validateSkillMd(skillDir);

  if (ok) {
    console.log('OK — SKILL.md frontmatter valid');
    process.exit(0);
  }

  console.error(`Found ${errors.length} SKILL.md error(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
