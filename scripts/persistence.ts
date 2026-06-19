/**
 * 游戏存档持久化 — save/game-state.json
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState } from './game-types';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAVE_DIR = join(ROOT_DIR, 'save');
const SAVE_FILE = join(SAVE_DIR, 'game-state.json');
const SAVE_TMP = join(SAVE_DIR, 'game-state.json.tmp');

export function getSavePath(): string {
  return SAVE_FILE;
}

function isValidGameState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false;
  const state = raw as GameState;
  if (!state.character?.name || typeof state.location !== 'string') return false;
  if (!state.inventory || typeof state.inventory.silver !== 'number') return false;
  if (!Array.isArray(state.inventory.items)) return false;
  if (typeof state.week !== 'number') return false;
  return true;
}

/** 补全旧存档缺失字段 */
function migrateGameState(state: GameState): GameState {
  if (!state.character.skillLevels) {
    state.character.skillLevels = Object.fromEntries(
      (state.character.skills ?? []).map((s) => [s, 0]),
    );
  }
  if (!Array.isArray(state.team)) {
    state.team = [];
  }
  if (!state.flags || typeof state.flags !== 'object') {
    state.flags = {};
  }
  if (!Array.isArray(state.visitedMaps)) {
    state.visitedMaps = [state.location];
  }
  if (!Array.isArray(state.completedQuests)) {
    state.completedQuests = [];
  }
  return state;
}

/** 读取存档；不存在或损坏时返回 null */
export function loadGameState(): GameState | null {
  if (!existsSync(SAVE_FILE)) return null;

  try {
    const raw = readFileSync(SAVE_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidGameState(parsed)) {
      return null;
    }
    return migrateGameState(parsed);
  } catch {
    return null;
  }
}

/** 写入存档（原子替换，避免写入中断损坏） */
export function saveGameState(state: GameState): void {
  if (!existsSync(SAVE_DIR)) {
    mkdirSync(SAVE_DIR, { recursive: true });
  }
  writeFileSync(SAVE_TMP, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(SAVE_TMP, SAVE_FILE);
}

/** 删除存档 */
export function deleteSave(): void {
  if (existsSync(SAVE_FILE)) {
    unlinkSync(SAVE_FILE);
  }
  if (existsSync(SAVE_TMP)) {
    unlinkSync(SAVE_TMP);
  }
}

/** 开始或继续：有存档则加载，否则新建并落盘 */
export function loadOrCreateGame(
  createNewGame: (name: string) => GameState,
  name = '主角',
): GameState {
  const existing = loadGameState();
  if (existing) return existing;
  const state = createNewGame(name);
  saveGameState(state);
  return state;
}
