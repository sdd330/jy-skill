#!/usr/bin/env node
/**
 * 金庸群侠传 MCP Server — 暴露游戏工具与 PlayerChoicePrompt 标准契约
 *
 * 用法: npx tsx scripts/mcp-server.ts
 * Cursor / Claude Desktop 配置 stdio 启动此脚本即可。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  loadOrCreateGameForUser,
  getStatus,
  getLocationDetail,
  resolveOption,
  buildChoicePrompt,
  toMcpElicitationParams,
  fromElicitationResponse,
  setSaveUserId,
} from './game-engine.js';
import type { GameState } from './game-types.js';

const sessions = new Map<string, GameState>();

function getSession(playerId: string): GameState {
  let state = sessions.get(playerId);
  if (!state) {
    setSaveUserId(playerId);
    const { state: loaded } = loadOrCreateGameForUser(playerId, '主角');
    state = loaded;
    sessions.set(playerId, state);
  }
  return state;
}

function attachChoiceMeta(result: unknown, state: GameState) {
  const prompt = buildChoicePrompt(state);
  return {
    result,
    playerChoice: prompt,
    mcpElicitation: toMcpElicitationParams(prompt),
    status: getStatus(state),
  };
}

const server = new McpServer({
  name: 'jy-skill',
  version: '0.6.0',
});

server.tool(
  'jy_load_game',
  '加载或新建金庸群侠传存档',
  {
    playerId: z.string().describe('玩家唯一 ID，如飞书 open_id'),
    name: z.string().optional().describe('新角色名，默认「主角」'),
  },
  async ({ playerId, name }) => {
    setSaveUserId(playerId);
    const { state, isNewGame } = loadOrCreateGameForUser(playerId, name ?? '主角');
    sessions.set(playerId, state);
    const prompt = buildChoicePrompt(state);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              isNewGame,
              location: state.location,
              status: getStatus(state),
              locationDetail: getLocationDetail(state),
              playerChoice: prompt,
              mcpElicitation: toMcpElicitationParams(prompt),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'jy_resolve_action',
  '执行玩家选中的行动（optionId 来自 playerChoice.choices[].value）',
  {
    playerId: z.string(),
    optionId: z.string().describe('PlayerChoicePrompt choices 中的 value'),
  },
  async ({ playerId, optionId }) => {
    const state = getSession(playerId);
    const resolved = resolveOption(state, optionId);
    const payload = attachChoiceMeta(resolved, state);
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  },
);

server.tool(
  'jy_get_status',
  '获取当前状态栏与可选行动',
  { playerId: z.string() },
  async ({ playerId }) => {
    const state = getSession(playerId);
    const prompt = buildChoicePrompt(state);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: getStatus(state),
              playerChoice: prompt,
              mcpElicitation: toMcpElicitationParams(prompt),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'jy_from_elicitation',
  '将 MCP Elicitation 用户响应解析为 optionId 并执行',
  {
    playerId: z.string(),
    elicitationContent: z.record(z.string(), z.unknown()).describe('elicitation 表单回传 JSON'),
  },
  async ({ playerId, elicitationContent }) => {
    const optionId = fromElicitationResponse(elicitationContent);
    if (!optionId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: '无效的 elicitation 响应' }) }],
        isError: true,
      };
    }
    const state = getSession(playerId);
    const resolved = resolveOption(state, optionId);
    const payload = attachChoiceMeta(resolved, state);
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
