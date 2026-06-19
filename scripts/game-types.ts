/**
 * 游戏状态类型 — game-engine 与 persistence 共享
 */

import type { DEFAULT_ATTRIBUTES } from './game-logic';

export interface Character {
  name: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  poison: number;
  hurt: number;
  attributes: typeof DEFAULT_ATTRIBUTES;
  equipment: { weapon: string | null; armor: string | null };
  skills: string[];
  skillLevels: Record<string, number>;
}

export interface Inventory {
  silver: number;
  items: Array<{ id: string; name: string; count: number }>;
}

export interface GameState {
  character: Character;
  team: string[];
  inventory: Inventory;
  location: string;
  week: number;
  flags: Record<string, boolean | number>;
  visitedMaps: string[];
  completedQuests: string[];
}

export interface BattleEnemy {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
}
