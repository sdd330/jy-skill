/**
 * 文档完整性校验 — 必备文件与 Markdown 相对链接
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillMd } from './validate-skill';

const REQUIRED_FILES = [
  'SKILL.md',
  'AGENTS.md',
  'LICENSE',
  'references/agent-handbook.md',
  'references/player-guide.md',
  'references/host-adapters.md',
];

const LINK_SCAN_FILES = ['SKILL.md', 'README.md', 'AGENTS.md'];

/** 匹配 [text](path) 相对路径链接，排除 http(s) 与 # 锚点 */
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

export interface DocsValidationResult {
  ok: boolean;
  errors: string[];
}

function isExternalOrAnchor(target: string): boolean {
  const t = target.trim();
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('#') ||
    t.startsWith('mailto:')
  );
}

export function collectMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  for (const match of content.matchAll(MARKDOWN_LINK)) {
    const target = match[2]?.trim();
    if (target && !isExternalOrAnchor(target)) {
      links.push(target.split('#')[0] ?? target);
    }
  }
  return links;
}

export function validateDocs(rootDir: string): DocsValidationResult {
  const errors: string[] = [];

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(join(rootDir, rel))) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  const skillMeta = validateSkillMd(rootDir);
  if (!skillMeta.ok) {
    errors.push(...skillMeta.errors.map((e) => `SKILL.md: ${e}`));
  }

  for (const rel of LINK_SCAN_FILES) {
    const filePath = join(rootDir, rel);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const baseDir = dirname(filePath);

    for (const link of collectMarkdownLinks(content)) {
      const resolved = resolve(baseDir, link);
      if (!existsSync(resolved)) {
        errors.push(`Broken link in ${rel}: (${link})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function main(): void {
  const rootDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { ok, errors } = validateDocs(rootDir);

  if (ok) {
    console.log('OK — documentation files and links valid');
    process.exit(0);
  }

  console.error(`Found ${errors.length} documentation error(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
