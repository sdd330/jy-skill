import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadGameState,
  saveGameState,
  deleteSave,
  loadOrCreateGame,
  getSavePath,
} from './persistence';
import { createNewGame } from './game-engine';
import { resetConfigsForTest, initConfigs } from './config-loader';
import type { GameState } from './game-types';

const SAVE_FILE = getSavePath();
const SAVE_TMP = `${SAVE_FILE}.tmp`;
const SAVE_DIR = dirname(SAVE_FILE);

function fullGameState(): GameState {
  resetConfigsForTest();
  initConfigs();
  const state = createNewGame('完整存档');
  state.character.level = 5;
  state.character.exp = 200;
  state.character.poison = 10;
  state.character.hurt = 5;
  state.character.equipment.weapon = '铁剑';
  state.flags.quest1 = true;
  state.completedQuests.push('tutorial');
  state.visitedMaps.push('平安镇');
  state.team.push('队友A');
  return state;
}

describe('persistence', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
  });

  afterEach(() => {
    deleteSave();
  });

  it('returns null when save file does not exist', () => {
    expect(loadGameState()).toBeNull();
  });

  it('round-trips all GameState fields', () => {
    const state = fullGameState();
    saveGameState(state);

    const loaded = loadGameState();
    expect(loaded).toEqual(state);
  });

  it('returns null for corrupted JSON', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(SAVE_FILE, '{ not valid json', 'utf-8');
    expect(loadGameState()).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(SAVE_FILE, JSON.stringify({ location: '小村' }), 'utf-8');
    expect(loadGameState()).toBeNull();

    writeFileSync(
      SAVE_FILE,
      JSON.stringify({ character: { name: '主角' }, location: '小村' }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();

    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: { name: '主角' },
        location: '小村',
        inventory: { silver: 100 },
      }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();
  });

  it('migrates legacy saves missing optional fields', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '旧存档',
          level: 1,
          exp: 0,
          hp: 100,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          stamina: 100,
          poison: 0,
          hurt: 0,
          attributes: {},
          equipment: { weapon: null, armor: null },
          skills: ['基本拳法', '六脉神剑'],
        },
        inventory: { silver: 50, items: [] },
        location: '小村',
        week: 3,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(loaded).not.toBeNull();
    expect(loaded!.character.skillLevels).toEqual({ 基本拳法: 0, 六脉神剑: 0 });
    expect(loaded!.team).toEqual([]);
    expect(loaded!.flags).toEqual({});
    expect(loaded!.visitedMaps).toEqual(['小村']);
    expect(loaded!.completedQuests).toEqual([]);
  });

  it('migrates skillLevels when skills array is missing', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '无武功列表',
          level: 1,
          exp: 0,
          hp: 100,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          stamina: 100,
          poison: 0,
          hurt: 0,
          attributes: {},
          equipment: { weapon: null, armor: null },
        },
        inventory: { silver: 50, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(loaded?.character.skillLevels).toEqual({});
  });

  it('returns null for non-object JSON', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(SAVE_FILE, 'null', 'utf-8');
    expect(loadGameState()).toBeNull();
  });

  it('returns null when week or items are invalid types', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: { name: '主角' },
        location: '小村',
        inventory: { silver: 100, items: 'not-array' },
        week: 1,
      }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();

    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: { name: '主角' },
        location: '小村',
        inventory: { silver: 100, items: [] },
        week: '1',
      }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();
  });

  it('preserves existing skillLevels without migration overwrite', () => {
    const state = createNewGame('老手');
    state.character.skillLevels['基本拳法'] = 3;
    saveGameState(state);

    const loaded = loadGameState();
    expect(loaded?.character.skillLevels['基本拳法']).toBe(3);
  });

  it('creates save directory when missing', () => {
    rmSync(SAVE_DIR, { recursive: true, force: true });
    saveGameState(createNewGame('mkdir'));
    expect(existsSync(SAVE_DIR)).toBe(true);
    expect(existsSync(SAVE_FILE)).toBe(true);
  });

  it('writes atomically and leaves no temp file', () => {
    const state = createNewGame('原子写');
    saveGameState(state);

    expect(existsSync(SAVE_FILE)).toBe(true);
    expect(existsSync(SAVE_TMP)).toBe(false);
    expect(loadGameState()?.character.name).toBe('原子写');
  });

  it('deleteSave removes save and temp files', () => {
    saveGameState(createNewGame('待删'));
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(SAVE_TMP, '{}', 'utf-8');

    deleteSave();

    expect(existsSync(SAVE_FILE)).toBe(false);
    expect(existsSync(SAVE_TMP)).toBe(false);
  });

  it('loadOrCreateGame loads existing save', () => {
    const state = createNewGame('续玩');
    saveGameState(state);

    const loaded = loadOrCreateGame(createNewGame, '新名字');
    expect(loaded.character.name).toBe('续玩');
  });

  it('loadOrCreateGame creates and persists new game when no save exists', () => {
    expect(existsSync(SAVE_FILE)).toBe(false);

    const state = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
    expect(existsSync(SAVE_FILE)).toBe(true);
    expect(loadGameState()?.character.name).toBe('新手');
  });
});
