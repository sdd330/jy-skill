import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const summaryPath = join(process.cwd(), 'coverage', 'coverage-summary.json');
const outPath = process.env.GITHUB_STEP_SUMMARY;

if (!existsSync(summaryPath)) {
  console.log('No coverage summary found at', summaryPath);
  process.exit(0);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

const pct = (entry, key) => {
  const value = entry?.[key]?.pct;
  return value === undefined ? '—' : `${value}%`;
};

const basename = (filePath) => filePath.split('/').pop() ?? filePath;

const rows = Object.entries(summary)
  .filter(([name]) => name !== 'total')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([name, entry]) =>
      `| ${basename(name)} | ${pct(entry, 'statements')} | ${pct(entry, 'branches')} | ${pct(entry, 'functions')} | ${pct(entry, 'lines')} |`,
  );

const total = summary.total;
const markdown = [
  '## Coverage Summary',
  '',
  '| File | Stmts | Branch | Funcs | Lines |',
  '|------|-------|--------|-------|-------|',
  ...rows,
  '',
  `**Total:** ${pct(total, 'statements')} statements · ${pct(total, 'branches')} branches · ${pct(total, 'functions')} functions · ${pct(total, 'lines')} lines`,
  '',
].join('\n');

console.log(markdown);

if (outPath) {
  appendFileSync(outPath, markdown + '\n');
}
