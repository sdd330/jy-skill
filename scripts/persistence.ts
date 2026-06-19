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
import { DEFAULT_ATTRIBUTES, MAX_STAMINA, MAX_LEVEL, MAX_EXP } from './game-logic';
import { getMap, getTemplates, initConfigs } from './config-loader';

export interface LoadGameResult {
  state: GameState;
  isNewGame: boolean;
}

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAVE_DIR = join(ROOT_DIR, 'save');
const SAVE_FILE = join(SAVE_DIR, 'game-state.json');
const SAVE_TMP = join(SAVE_DIR, 'game-state.json.tmp');

export function getSavePath(): string {
  return SAVE_FILE;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidGameState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false;
  const state = raw as GameState;
  const c = state.character;
  if (!c?.name || typeof state.location !== 'string') return false;
  if (!state.inventory || !isFiniteNumber(state.inventory.silver)) return false;
  if (!Array.isArray(state.inventory.items)) return false;
  if (!isFiniteNumber(state.week)) return false;
  if (!isFiniteNumber(c.hp) || !isFiniteNumber(c.mp)) return false;
  if (!isFiniteNumber(c.stamina)) return false;
  return true;
}

/** 补全旧存档缺失字段 */
function migrateGameState(state: GameState): GameState {
  initConfigs();

  if (typeof state.character.skills === 'string') {
    state.character.skills = [state.character.skills];
  } else if (!Array.isArray(state.character.skills)) {
    state.character.skills = [...(getTemplates().defaultCharacter.skills ?? ['基本拳法'])];
  }
  if (!state.character.skillLevels) {
    state.character.skillLevels = Object.fromEntries(state.character.skills.map((s) => [s, 0]));
  }
  for (const skill of state.character.skills) {
    if (state.character.skillLevels[skill] == null) {
      state.character.skillLevels[skill] = 0;
    }
  }
  if (!state.character.skillExp) {
    state.character.skillExp = Object.fromEntries(state.character.skills.map((s) => [s, 0]));
  }
  for (const skill of state.character.skills) {
    if (state.character.skillExp![skill] == null) {
      state.character.skillExp![skill] = 0;
    }
  }
  if (!state.character.buffs) {
    state.character.buffs = {};
  }
  if (!state.character.attributes || typeof state.character.attributes !== 'object') {
    state.character.attributes = { ...DEFAULT_ATTRIBUTES };
  } else {
    state.character.attributes = { ...DEFAULT_ATTRIBUTES, ...state.character.attributes };
  }
  if (!state.character.equipment) {
    state.character.equipment = { weapon: null, armor: null };
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

  const c = state.character;
  if (typeof c.maxHp !== 'number') c.maxHp = DEFAULT_ATTRIBUTES.maxHp;
  if (typeof c.maxMp !== 'number') c.maxMp = DEFAULT_ATTRIBUTES.maxMp;
  c.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(c.level ?? 1)));
  c.exp = Math.max(0, Math.min(MAX_EXP, Math.floor(c.exp ?? 0)));
  c.hp = Math.max(0, Math.min(c.maxHp, c.hp));
  c.mp = Math.max(0, Math.min(c.maxMp, c.mp));
  c.stamina = Math.max(0, Math.min(MAX_STAMINA, c.stamina));
  c.poison = Math.max(0, c.poison);
  c.hurt = Math.max(0, c.hurt);
  c.attributes.level = c.level;
  c.attributes.exp = c.exp;

  state.inventory.silver = Math.max(0, Math.floor(state.inventory.silver));
  for (const item of state.inventory.items) {
    item.count = Math.max(0, Math.floor(item.count));
  }
  state.inventory.items = state.inventory.items.filter((i) => i.count > 0);

  if (!getMap(state.location)) {
    state.location = getTemplates().startLocation ?? '小村';
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
): LoadGameResult {
  const existing = loadGameState();
  if (existing) return { state: existing, isNewGame: false };
  const state = createNewGame(name);
  saveGameState(state);
  return { state, isNewGame: true };
}
