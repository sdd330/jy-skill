import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  loadGameState,
  saveGameState,
  deleteSave,
  loadOrCreateGame,
  loadOrCreateGameForUser,
  setSaveUserId,
  getSaveUserId,
  getSavePath,
} from './persistence';
import { createNewGame } from './game-engine';
import { resetConfigsForTest, initConfigs } from './config-loader';
import * as configLoader from './config-loader';
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
  state.character.attributes.level = 5;
  state.character.attributes.exp = 200;
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
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(join(SAVE_DIR, '.gitkeep'), '', 'utf-8');
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
    expect(loaded!.character.attributes.attack).toBe(20);
    expect(loaded!.team).toEqual([]);
    expect(loaded!.flags).toEqual({});
    expect(loaded!.visitedMaps).toEqual(['小村']);
    expect(loaded!.completedQuests).toEqual([]);
  });

  it('defaults skills from template when legacy save omits skill list', () => {
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

    const base = configLoader.getTemplates();
    vi.spyOn(configLoader, 'getTemplates').mockReturnValue({
      ...base,
      defaultCharacter: { ...base.defaultCharacter, skills: undefined as unknown as string[] },
    });

    const loaded = loadGameState();
    expect(loaded?.character.skills).toEqual(['基本拳法']);
    expect(loaded?.character.skillLevels).toEqual({ 基本拳法: 0 });
    vi.restoreAllMocks();
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
    writeFileSync(join(SAVE_DIR, '.gitkeep'), '', 'utf-8');
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

    const { state: loaded, isNewGame } = loadOrCreateGame(createNewGame, '新名字');
    expect(loaded.character.name).toBe('续玩');
    expect(isNewGame).toBe(false);
  });

  it('loadOrCreateGame creates and persists new game when no save exists', () => {
    expect(existsSync(SAVE_FILE)).toBe(false);

    const { state, isNewGame } = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
    expect(isNewGame).toBe(true);
    expect(existsSync(SAVE_FILE)).toBe(true);
    expect(loadGameState()?.character.name).toBe('新手');
  });

  it('migrates legacy saves missing attributes and equipment entirely', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '残缺',
          level: 1,
          exp: 0,
          hp: 100,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          stamina: 100,
          poison: 0,
          hurt: 0,
          skills: ['基本拳法'],
        },
        inventory: { silver: 50, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(loaded?.character.attributes.attack).toBe(20);
    expect(loaded?.character.equipment).toEqual({ weapon: null, armor: null });
  });

  it('migrates saves with non-array skills and missing numeric caps', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '残缺',
          level: 1,
          exp: 0,
          hp: 100,
          mp: 50,
          stamina: 100,
          poison: 0,
          hurt: 0,
          attributes: { attack: 25 },
          equipment: { weapon: null, armor: null },
          skills: '基本拳法',
        },
        inventory: { silver: 50, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(Array.isArray(loaded?.character.skills)).toBe(true);
    expect(loaded?.character.skills).toContain('基本拳法');
    expect(loaded?.character.maxHp).toBe(100);
    expect(loaded?.character.maxMp).toBe(50);
  });

  it('migrates missing skillLevels and skillExp entries for known skills', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '老档',
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
          skillLevels: { 基本拳法: 2 },
          skillExp: { 基本拳法: 10 },
        },
        inventory: { silver: 50, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(loaded?.character.skillLevels['六脉神剑']).toBe(0);
    expect(loaded?.character.skillExp?.['六脉神剑']).toBe(0);
    expect(loaded?.character.buffs).toEqual({});
  });

  it('returns null when numeric character fields are invalid', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '坏档',
          hp: 'bad',
          mp: 50,
          stamina: 100,
        },
        inventory: { silver: 0, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();

    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '坏档2',
          hp: 50,
          mp: 50,
          stamina: 'bad',
        },
        inventory: { silver: 0, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );
    expect(loadGameState()).toBeNull();
  });

  it('migrates missing level and exp fields', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '无等级',
          hp: 100,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          stamina: 100,
          poison: 0,
          hurt: 0,
          attributes: {},
          equipment: { weapon: null, armor: null },
          skills: ['基本拳法'],
        },
        inventory: { silver: 0, items: [] },
        location: '小村',
        week: 1,
      }),
      'utf-8',
    );
    const loaded = loadGameState();
    expect(loaded?.character.level).toBe(1);
    expect(loaded?.character.exp).toBe(0);
  });

  it('falls back to default start location when saved location is unknown', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '迷路',
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
          skills: ['基本拳法'],
        },
        inventory: { silver: 50, items: [] },
        location: '不存在的地方',
        week: 1,
      }),
      'utf-8',
    );

    const base = configLoader.getTemplates();
    vi.spyOn(configLoader, 'getTemplates').mockReturnValue({
      ...base,
      startLocation: undefined as unknown as string,
    });

    const loaded = loadGameState();
    expect(loaded?.location).toBe('小村');
    vi.restoreAllMocks();
  });

  it('clamps out-of-range stats on legacy saves', () => {
    mkdirSync(SAVE_DIR, { recursive: true });
    writeFileSync(
      SAVE_FILE,
      JSON.stringify({
        character: {
          name: '旧存档',
          level: 1,
          exp: 0,
          hp: 200,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          stamina: 150,
          poison: -5,
          hurt: 0,
          attributes: {},
          equipment: { weapon: null, armor: null },
          skills: ['基本拳法'],
        },
        inventory: { silver: 50, items: [] },
        location: '不存在的地方',
        week: 3,
      }),
      'utf-8',
    );

    const loaded = loadGameState();
    expect(loaded!.character.hp).toBe(100);
    expect(loaded!.character.stamina).toBe(100);
    expect(loaded!.character.poison).toBe(0);
    expect(loaded!.location).toBe('小村');
  });

  describe('multi-user saves', () => {
    const USER_A = 'ou_test_user_a';
    const USER_B = 'ou_test_user_b';

    afterEach(() => {
      setSaveUserId(null);
      deleteSave(USER_A);
      deleteSave(USER_B);
    });

    it('stores separate saves per userId', () => {
      resetConfigsForTest();
      initConfigs();

      const { state: stateA, isNewGame: newA } = loadOrCreateGameForUser(
        USER_A,
        createNewGame,
        '甲',
      );
      expect(newA).toBe(true);
      stateA.character.level = 3;
      saveGameState(stateA, USER_A);

      const { state: stateB, isNewGame: newB } = loadOrCreateGameForUser(
        USER_B,
        createNewGame,
        '乙',
      );
      expect(newB).toBe(true);
      stateB.character.level = 7;
      saveGameState(stateB, USER_B);

      const loadedA = loadGameState(USER_A);
      const loadedB = loadGameState(USER_B);
      expect(loadedA?.character.name).toBe('甲');
      expect(loadedA?.character.level).toBe(3);
      expect(loadedB?.character.name).toBe('乙');
      expect(loadedB?.character.level).toBe(7);
      expect(getSavePath(USER_A)).not.toBe(getSavePath(USER_B));
    });

    it('sanitizes unsafe userId in save filename', () => {
      const unsafe = 'user/with\\spaces';
      const path = getSavePath(unsafe);
      expect(path.endsWith('user_with_spaces.json')).toBe(true);
    });

    it('setSaveUserId routes default saveGameState to user file', () => {
      resetConfigsForTest();
      initConfigs();
      setSaveUserId(USER_A);
      const state = createNewGame('会话用户');
      saveGameState(state);
      expect(existsSync(getSavePath(USER_A))).toBe(true);
      const loaded = loadGameState(USER_A);
      expect(loaded?.character.name).toBe('会话用户');
    });

    it('getSaveUserId returns current session user', () => {
      setSaveUserId(null);
      expect(getSaveUserId()).toBeNull();
      setSaveUserId(USER_A);
      expect(getSaveUserId()).toBe(USER_A);
    });
  });
});
