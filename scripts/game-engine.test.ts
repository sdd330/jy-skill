import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import {
  createNewGame,
  moveTo,
  buyItem,
  talkTo,
  startBattle,
  attackEnemy,
  enemyAttack,
  useSkillInBattle,
  equipItem,
  learnSkill,
  useItem,
  rest,
  isDead,
  getStatus,
  getInventory,
  getSkills,
  advanceWeek,
  loadGameState,
  saveGameState,
  deleteSave,
  loadOrCreateGame,
  getSavePath,
} from './game-engine';
import { calculateMpCost, getExpForLevel } from './game-logic';
import * as configLoader from './config-loader';
import {
  validateAssets,
  getMap,
  getSkill,
  resetConfigsForTest,
  initConfigs,
} from './config-loader';

const SAVE_FILE = getSavePath();
const fixedRandom = (value: number) => value;

describe('config-loader', () => {
  it('validates all assets without errors', () => {
    const errors = validateAssets();
    expect(errors).toEqual([]);
  });

  it('loads maps from assets', () => {
    initConfigs();
    const map = getMap('小村');
    expect(map?.npcs).toContain('村长');
    expect(map?.connections).toContain('平安镇');
  });

  it('loads skills from assets', () => {
    initConfigs();
    expect(getSkill('基本拳法')?.mpCost).toBe(0);
    expect(getSkill('六脉神剑')?.mpCost).toBe(30);
  });
});

describe('game-engine', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
  });

  afterEach(() => {
    deleteSave();
    vi.restoreAllMocks();
  });

  it('creates new game at 小村 with default skills', () => {
    const state = createNewGame('令狐冲');
    expect(state.location).toBe('小村');
    expect(state.character.name).toBe('令狐冲');
    expect(state.character.skills).toContain('基本拳法');
  });

  it('moveTo rejects invalid destination', () => {
    const state = createNewGame('主角');
    const result = moveTo(state, '光明顶');
    expect(result.success).toBe(false);
  });

  it('moveTo succeeds to connected map', () => {
    const state = createNewGame('主角');
    const result = moveTo(state, '平安镇');
    expect(result.success).toBe(true);
    expect(state.location).toBe('平安镇');
  });

  it('buyItem checks shop availability', () => {
    const state = createNewGame('主角');
    state.inventory.silver = 500;
    moveTo(state, '平安镇');
    const ok = buyItem(state, '铁剑');
    expect(ok.success).toBe(true);
    expect(state.inventory.items.some((i) => i.name === '铁剑')).toBe(true);
  });

  it('talkTo uses dialog from game-config', () => {
    const state = createNewGame('主角');
    const result = talkTo(state, '村长');
    expect(result.success).toBe(true);
    expect(result.message).toContain('村长');
  });

  it('startBattle spawns enemies from character assets', () => {
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    expect(battle.success).toBe(true);
    expect(battle.enemies?.[0].hp).toBe(80);
  });

  it('useSkillInBattle reads skill damage from skills.json', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 100;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const result = useSkillInBattle(state, enemies, '基本拳法', 0);
    expect(result.success).toBe(true);
    expect(enemies[0].hp).toBeLessThan(80);
  });

  it('persists and loads game state', () => {
    const state = createNewGame('存档测试');
    moveTo(state, '平安镇');

    expect(existsSync(SAVE_FILE)).toBe(true);
    const loaded = loadGameState();
    expect(loaded?.character.name).toBe('存档测试');
    expect(loaded?.location).toBe('平安镇');
  });

  it('loadOrCreateGame loads existing save', () => {
    const state = createNewGame('续玩');
    saveGameState(state);
    const loaded = loadOrCreateGame(createNewGame, '新角色');
    expect(loaded.character.name).toBe('续玩');
  });
});

describe('game-engine auto-save', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
  });

  afterEach(() => {
    deleteSave();
    vi.restoreAllMocks();
  });

  it('moveTo auto-saves without explicit saveGameState', () => {
    const state = createNewGame('行者');
    moveTo(state, '平安镇');

    const loaded = loadGameState();
    expect(loaded?.location).toBe('平安镇');
    expect(loaded?.week).toBe(2);
  });

  it('buyItem auto-saves inventory changes', () => {
    const state = createNewGame('买家');
    state.inventory.silver = 500;
    moveTo(state, '平安镇');
    deleteSave();

    buyItem(state, '铁剑');

    const loaded = loadGameState();
    expect(loaded?.inventory.items.some((i) => i.name === '铁剑')).toBe(true);
    expect(loaded?.inventory.silver).toBeLessThan(500);
  });

  it('attackEnemy auto-saves stamina and exp changes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('战士');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const staminaBefore = state.character.stamina;

    attackEnemy(state, enemies, 0);

    const loaded = loadGameState();
    expect(loaded?.character.stamina).toBe(staminaBefore - 3);
  });

  it('loadOrCreateGame persists new game on first start', () => {
    expect(existsSync(SAVE_FILE)).toBe(false);
    const state = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
    expect(existsSync(SAVE_FILE)).toBe(true);
  });
});

describe('game-engine battle', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
    vi.spyOn(Math, 'random').mockReturnValue(fixedRandom(1));
  });

  afterEach(() => {
    deleteSave();
    vi.restoreAllMocks();
  });

  it('attackEnemy deals damage and reduces stamina', () => {
    const state = createNewGame('主角');
    const staminaBefore = state.character.stamina;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const hpBefore = enemies[0].hp;

    const result = attackEnemy(state, enemies, 0);

    expect(result.enemyDefeated).toBe(false);
    expect(enemies[0].hp).toBe(hpBefore - 12);
    expect(state.character.stamina).toBe(staminaBefore - 3);
    expect(result.message).toContain('12点伤害');
  });

  it('attackEnemy grants exp when enemy defeated', () => {
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 12;
    const expBefore = state.character.exp;

    const result = attackEnemy(state, enemies, 0);

    expect(result.enemyDefeated).toBe(true);
    expect(state.character.exp).toBe(expBefore + 18);
  });

  it('enemyAttack deals max(1, attack - defence) damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const hpBefore = state.character.hp;

    const result = enemyAttack(state, enemies);

    expect(result.message).toContain('5点伤害');
    expect(state.character.hp).toBe(hpBefore - 5);
    expect(result.playerDefeated).toBe(false);
  });

  it('enemyAttack sets playerDefeated when hp reaches 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    state.character.hp = 3;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;

    const result = enemyAttack(state, enemies);

    expect(result.playerDefeated).toBe(true);
    expect(isDead(state)).toBe(true);
  });

  it('useSkillInBattle rejects when mp is insufficient', () => {
    const state = createNewGame('主角');
    learnSkill(state, '六脉神剑');
    state.character.mp = 5;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const mpNeeded = calculateMpCost(30, 0);

    const result = useSkillInBattle(state, enemies, '六脉神剑', 0);

    expect(result.success).toBe(false);
    expect(result.message).toContain(`内力不足，需要${mpNeeded}点内力`);
  });

  it('useSkillInBattle deducts mp by calculateMpCost', () => {
    const state = createNewGame('主角');
    learnSkill(state, '六脉神剑');
    state.character.mp = 50;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const mpCost = calculateMpCost(30, 0);

    useSkillInBattle(state, enemies, '六脉神剑', 0);

    expect(state.character.mp).toBe(50 - mpCost);
  });

  it('equipped weapon increases attack damage', () => {
    const state = createNewGame('主角');
    state.inventory.silver = 500;
    moveTo(state, '平安镇');
    buyItem(state, '铁剑');
    equipItem(state, '铁剑');

    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    attackEnemy(state, enemies, 0);

    expect(enemies[0].hp).toBe(80 - 24);
  });

  it('levels up after gaining enough battle exp', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    state.character.exp = 140;
    const maxHpBefore = state.character.maxHp;
    const attackBefore = state.character.attributes.attack;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 1;

    attackEnemy(state, enemies, 0);

    expect(state.character.level).toBe(2);
    expect(state.character.maxHp).toBeGreaterThan(maxHpBefore);
    expect(state.character.attributes.attack).toBeGreaterThan(attackBefore);
  });

  it('moveTo applies poison and hurt damage but keeps at least 1 hp', () => {
    const state = createNewGame('主角');
    state.character.poison = 50;
    state.character.hurt = 40;
    state.character.hp = 10;

    moveTo(state, '平安镇');

    expect(state.character.hp).toBe(3);
  });

  it('rest restores full status and clears poison and hurt', () => {
    const state = createNewGame('主角');
    state.character.hp = 10;
    state.character.mp = 5;
    state.character.stamina = 20;
    state.character.poison = 30;
    state.character.hurt = 20;

    rest(state);

    expect(state.character.hp).toBe(state.character.maxHp);
    expect(state.character.mp).toBe(state.character.maxMp);
    expect(state.character.stamina).toBe(100);
    expect(state.character.poison).toBe(0);
    expect(state.character.hurt).toBe(0);
  });

  it('getStatus includes exp threshold from getExpForLevel', () => {
    const state = createNewGame('主角');
    const status = getStatus(state);
    expect(status).toContain(`经验: 0/${getExpForLevel(2)}`);
  });
});

describe('game-engine coverage', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
  });

  afterEach(() => {
    deleteSave();
    vi.restoreAllMocks();
  });

  it('getStatus shows poison and hurt when present', () => {
    const state = createNewGame('主角');
    state.character.poison = 10;
    state.character.hurt = 20;
    const status = getStatus(state);
    expect(status).toContain('中毒: 10');
    expect(status).toContain('受伤: 20');
  });

  it('getInventory lists items and handles empty backpack', () => {
    const withItems = createNewGame('主角');
    expect(getInventory(withItems)).toContain('金创药');

    const empty = createNewGame('主角');
    empty.inventory.items = [];
    expect(getInventory(empty)).toContain('背包空空如也');
  });

  it('getSkills lists skills and handles none learned', () => {
    const state = createNewGame('主角');
    expect(getSkills(state)).toContain('基本拳法');

    state.character.skills = [];
    expect(getSkills(state)).toContain('还没有学会任何武功');
  });

  it('moveTo handles unknown location and random destination', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    state.location = '虚空';
    expect(moveTo(state, '平安镇').message).toBe('当前位置未知');

    state.location = '小村';
    const random = moveTo(state, 'random');
    expect(random.success).toBe(true);
    expect(state.location).toBe('平安镇');
  });

  it('moveTo rejects random move when nowhere to go', () => {
    const state = createNewGame('主角');
    vi.spyOn(configLoader, 'getMap').mockReturnValue({
      npcs: [],
      shops: [],
      connections: [],
      npcDialogs: {},
    });
    expect(moveTo(state, 'random').message).toBe('无处可去');
  });

  it('moveTo does not duplicate visited maps', () => {
    const state = createNewGame('主角');
    moveTo(state, '平安镇');
    const count = state.visitedMaps.filter((m) => m === '平安镇').length;
    moveTo(state, '小村');
    moveTo(state, '平安镇');
    expect(state.visitedMaps.filter((m) => m === '平安镇').length).toBe(count);
  });

  it('talkTo handles unknown map, random npc, missing npc, and fallback dialog', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');

    state.location = '虚空';
    expect(talkTo(state, '村长').message).toBe('当前位置未知');

    state.location = '小村';
    vi.spyOn(configLoader, 'getMap').mockReturnValueOnce({
      npcs: [],
      shops: [],
      connections: ['平安镇'],
      npcDialogs: {},
    });
    expect(talkTo(state, 'random').message).toBe('这里没有人');

    expect(talkTo(state, 'random').success).toBe(true);
    expect(talkTo(state, 'random').message).toContain('：「');

    expect(talkTo(state, '不存在').message).toContain('没有不存在');

    vi.spyOn(configLoader, 'getMap').mockReturnValue({
      npcs: ['路人'],
      shops: [],
      connections: [],
      npcDialogs: {},
    });
    expect(talkTo(state, '路人').message).toBe('你和路人聊了起来');

    vi.restoreAllMocks();
    resetConfigsForTest();
    initConfigs();
    vi.spyOn(configLoader, 'getDialog').mockReturnValue(undefined);
    const s2 = createNewGame('主角');
    expect(talkTo(s2, '村长').message).toBe('你和村长聊了起来');
  });

  it('buyItem validates item, shop, silver, and stacks purchases', () => {
    const state = createNewGame('主角');
    expect(buyItem(state, '不存在').message).toContain('没有不存在出售');

    expect(buyItem(state, '铁剑').message).toContain('没有卖铁剑');

    state.inventory.silver = 5;
    expect(buyItem(state, '金创药').message).toContain('银两不足');

    state.inventory.silver = 500;
    buyItem(state, '金创药');
    const before = state.inventory.items.find((i) => i.name === '金创药')!.count;
    buyItem(state, '金创药');
    const after = state.inventory.items.find((i) => i.name === '金创药')!.count;
    expect(after).toBe(before + 1);
  });

  it('useItem heals, removes stack, and rejects invalid uses', () => {
    const state = createNewGame('主角');
    expect(useItem(state, '不存在').message).toContain('没有不存在');
    state.inventory.items.push({ id: '10', name: '铁剑', count: 1 });
    expect(useItem(state, '铁剑').message).toContain('无法使用');

    state.character.hp = 60;
    useItem(state, '金创药');
    expect(state.character.hp).toBe(100);

    state.character.mp = 10;
    state.inventory.items.push({ id: '31', name: '小还丹', count: 1 });
    useItem(state, '小还丹');
    expect(state.character.mp).toBe(50);

    state.character.stamina = 50;
    useItem(state, '干粮');
    expect(state.character.stamina).toBe(70);

    state.character.poison = 30;
    state.inventory.items.push({ id: '36', name: '解毒丸', count: 1 });
    useItem(state, '解毒丸');
    expect(state.character.poison).toBe(0);

    const state2 = createNewGame('主角');
    state2.inventory.items = [{ id: '30', name: '金创药', count: 1 }];
    state2.character.hp = 95;
    useItem(state2, '金创药');
    expect(state2.inventory.items.find((i) => i.name === '金创药')).toBeUndefined();
  });

  it('equipItem handles weapon, armor, and errors', () => {
    const state = createNewGame('主角');
    expect(equipItem(state, '不存在').message).toContain('没有不存在');

    state.inventory.items.push({ id: '99', name: '幻影剑', count: 1 });
    vi.spyOn(configLoader, 'getItem').mockReturnValue(undefined);
    expect(equipItem(state, '幻影剑').message).toContain('未知物品幻影剑');

    vi.restoreAllMocks();
    resetConfigsForTest();
    initConfigs();
    const s2 = createNewGame('主角');
    s2.inventory.silver = 500;
    moveTo(s2, '平安镇');
    buyItem(s2, '铁剑');
    buyItem(s2, '布衣');
    expect(equipItem(s2, '铁剑').success).toBe(true);
    expect(equipItem(s2, '布衣').success).toBe(true);
    expect(equipItem(s2, '金创药').message).toContain('不可装备');
  });

  it('learnSkill validates unknown and duplicate skills', () => {
    const state = createNewGame('主角');
    expect(learnSkill(state, '不存在武功').message).toContain('江湖上没有');
    learnSkill(state, '六脉神剑');
    expect(learnSkill(state, '六脉神剑').message).toContain('已经学会了');
  });

  it('startBattle handles missing enemy, solo, and groups', () => {
    const state = createNewGame('主角');
    expect(startBattle(state, '不存在').message).toContain('没有遇到');

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const tiger = startBattle(state, '老虎');
    expect(tiger.enemies).toHaveLength(1);
    expect(tiger.enemies![0].name).toBe('老虎');

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const group = startBattle(state, '山贼');
    expect(group.enemies!.length).toBeGreaterThan(1);
    expect(group.enemies![1].name).toBe('山贼2');
  });

  it('attackEnemy rejects invalid targets', () => {
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 0;
    expect(attackEnemy(state, enemies, 0).message).toBe('目标无效');
    expect(attackEnemy(state, enemies, 99).message).toBe('目标无效');
  });

  it('useSkillInBattle covers skill errors and defeating blows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;

    expect(useSkillInBattle(state, enemies, '不存在', 0).message).toContain('没有学会');

    state.character.skills.push('假武功');
    vi.spyOn(configLoader, 'getSkill').mockReturnValue(undefined);
    expect(useSkillInBattle(state, enemies, '假武功', 0).message).toContain('未知武功');

    vi.restoreAllMocks();
    resetConfigsForTest();
    initConfigs();
    const s2 = createNewGame('主角');
    s2.character.mp = 100;
    const b2 = startBattle(s2, '山贼');
    const e2 = b2.enemies!;
    e2[0].hp = 1;
    const result = useSkillInBattle(s2, e2, '基本拳法', 0);
    expect(result.success).toBe(true);
    expect(result.message).toContain('击败');
    expect(useSkillInBattle(s2, e2, '基本拳法', 0).message).toBe('目标无效');
  });

  it('enemyAttack skips when no enemies remain and respects armor', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 0;
    expect(enemyAttack(state, enemies).message).toBe('');

    const armored = createNewGame('主角');
    armored.inventory.silver = 500;
    moveTo(armored, '平安镇');
    buyItem(armored, '皮甲');
    equipItem(armored, '皮甲');
    const b2 = startBattle(armored, '山贼');
    const hpBefore = armored.character.hp;
    enemyAttack(armored, b2.enemies!);
    expect(armored.character.hp).toBe(hpBefore - 1);
  });

  it('advanceWeek applies poison and hurt effects', () => {
    const state = createNewGame('主角');
    state.character.poison = 50;
    state.character.hurt = 40;
    state.character.hp = 20;
    advanceWeek(state);
    expect(state.week).toBe(2);
    expect(state.character.hp).toBe(13);
  });

  it('levels up repeatedly until max level cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    state.character.level = 99;
    state.character.exp = getExpForLevel(100);
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 1;
    attackEnemy(state, enemies, 0);
    expect(state.character.level).toBe(100);
  });

  it('loadOrCreateGame creates new game when no save exists', () => {
    deleteSave();
    const state = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
  });

  it('createNewGame uses defaults when template omits skills and startLocation', () => {
    const base = configLoader.getTemplates();
    vi.spyOn(configLoader, 'getTemplates').mockReturnValue({
      ...base,
      defaultCharacter: { ...base.defaultCharacter, skills: undefined as unknown as string[] },
      startLocation: undefined as unknown as string,
    });
    const state = createNewGame('无名');
    expect(state.location).toBe('小村');
    expect(state.visitedMaps).toEqual(['小村']);
    expect(state.character.skills).toEqual(['基本拳法']);
    expect(state.character.skillLevels['基本拳法']).toBe(0);
  });

  it('useSkillInBattle uses level 0 when skillLevels entry is missing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.skills.push('六脉神剑');
    delete state.character.skillLevels['六脉神剑'];
    state.character.mp = 100;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    const result = useSkillInBattle(state, enemies, '六脉神剑', 0);
    expect(result.success).toBe(true);
    expect(state.character.mp).toBe(100 - calculateMpCost(30, 0));
  });

  it('getEffectiveAttack and getEffectiveDefence skip missing item configs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    state.character.equipment.weapon = '铁剑';
    state.character.equipment.armor = '皮甲';
    vi.spyOn(configLoader, 'getItem').mockReturnValue(undefined);
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    expect(attackEnemy(state, enemies, 0).message).toContain('造成');
    enemyAttack(state, enemies);
    expect(state.character.hp).toBeLessThan(100);
  });
});
