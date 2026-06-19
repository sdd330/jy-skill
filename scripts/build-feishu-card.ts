#!/usr/bin/env node
/**
 * 将 PlayerChoicePrompt 转为飞书交互卡片 JSON
 *
 * 用法:
 *   echo '{"type":"player_choice","message":"...","choices":[...]}' | npx tsx scripts/build-feishu-card.ts
 *   npx tsx scripts/build-feishu-card.ts --demo
 */

import { readFileSync } from 'node:fs';
import { createNewGame, buildChoicePrompt } from './game-engine.js';
import { toFeishuInteractiveCard, feishuCardToMessageContent } from './choice-prompt.js';
import type { PlayerChoicePrompt } from './game-types.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c: Buffer) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  let prompt: PlayerChoicePrompt;

  if (process.argv.includes('--demo')) {
    const state = createNewGame('主角');
    prompt = buildChoicePrompt(state);
  } else if (process.argv[2] && !process.argv[2].startsWith('-')) {
    prompt = JSON.parse(readFileSync(process.argv[2], 'utf-8')) as PlayerChoicePrompt;
  } else {
    const input = await readStdin();
    if (!input.trim()) {
      console.error('Usage: build-feishu-card.ts [prompt.json] | --demo | stdin JSON');
      process.exit(1);
    }
    prompt = JSON.parse(input) as PlayerChoicePrompt;
  }

  const card = toFeishuInteractiveCard(prompt);
  const output = {
    msg_type: 'interactive',
    content: feishuCardToMessageContent(card),
    card,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
