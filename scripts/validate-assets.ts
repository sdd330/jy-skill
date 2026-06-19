/**
 * 资产校验 CLI — CI / 本地验证
 *
 * 用法: npx tsx scripts/validate-assets.ts
 */

import { validateAssets } from './config-loader';

const errors = validateAssets();

if (errors.length === 0) {
  console.log('OK — all assets valid');
  process.exit(0);
}

console.error(`Found ${errors.length} asset error(s):`);
for (const err of errors) {
  console.error(`  - ${err}`);
}
process.exit(1);
