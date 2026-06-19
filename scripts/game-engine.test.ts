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
  consumeItemStack,
  isDead,
  getStatus,
  getInventory,
  getSkills,
  getLocationInfo,
  restartGame,
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

    const cave = getMap('山洞');
    expect(cave?.encounterRate).toBe(20);
    expect(cave?.encounterEnemies).toEqual(['山贼', '强盗', '老虎']);
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
    const { state: loaded, isNewGame } = loadOrCreateGame(createNewGame, '新角色');
    expect(loaded.character.name).toBe('续玩');
    expect(isNewGame).toBe(false);
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
    const { state, isNewGame } = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
    expect(isNewGame).toBe(true);
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

  it('getStatus shows max level exp without overflow threshold', () => {
    const state = createNewGame('主角');
    state.character.level = 100;
    state.character.exp = 5000;
    const status = getStatus(state);
    expect(status).toContain('经验: 5000（已满级）');
    expect(status).not.toContain('经验: 5000/');
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

    delete state.character.skillLevels['基本拳法'];
    const skillExp = state.character.skillExp!;
    delete skillExp['基本拳法'];
    expect(getSkills(state)).toContain('熟练 0/100');

    state.character.skillExp = { 基本拳法: 42 };
    expect(getSkills(state)).toContain('熟练 42/100');

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

  it('moveTo triggers random encounter in cave when roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    const state = createNewGame('主角');
    const result = moveTo(state, '山洞');
    expect(result.success).toBe(true);
    expect(result.encounter).toBe('山贼');
    expect(result.message).toContain('埋伏');
  });

  it('moveTo skips encounter when roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = createNewGame('主角');
    const result = moveTo(state, '山洞');
    expect(result.success).toBe(true);
    expect(result.encounter).toBeUndefined();
  });

  it('getLocationInfo handles unknown location and sparse maps', () => {
    const state = createNewGame('主角');
    state.location = '虚空';
    expect(getLocationInfo(state)).toBe('当前位置未知');

    vi.spyOn(configLoader, 'getMap').mockReturnValue({
      npcs: [],
      shops: [],
      connections: [],
      npcDialogs: {},
    });
    state.location = '荒原';
    expect(getLocationInfo(state)).toBe('📍 荒原');
  });

  it('getLocationInfo lists connections, npcs, shops, and danger hint', () => {
    const state = createNewGame('主角');
    expect(getLocationInfo(state)).toContain('小村');
    expect(getLocationInfo(state)).toContain('村长');

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    moveTo(state, '山洞');
    expect(getLocationInfo(state)).toContain('歹人埋伏');
  });

  it('restartGame clears save and creates fresh character', () => {
    const state = createNewGame('旧角色');
    state.character.level = 10;
    saveGameState(state);

    const fresh = restartGame('新侠');
    expect(fresh.character.name).toBe('新侠');
    expect(fresh.character.level).toBe(1);
    expect(loadGameState()?.character.name).toBe('新侠');
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
    const dePoisonResult = useItem(state, '解毒丸');
    expect(dePoisonResult.success).toBe(true);
    expect(dePoisonResult.message).toContain('解除中毒');
    expect(state.character.poison).toBe(0);

    const state2 = createNewGame('主角');
    state2.inventory.items = [{ id: '30', name: '金创药', count: 1 }];
    state2.character.hp = 95;
    useItem(state2, '金创药');
    expect(state2.inventory.items).toHaveLength(0);

    const fullHp = createNewGame('主角');
    const countBefore = fullHp.inventory.items.find((i) => i.name === '金创药')!.count;
    expect(useItem(fullHp, '金创药').success).toBe(false);
    expect(fullHp.inventory.items.find((i) => i.name === '金创药')!.count).toBe(countBefore);

    const noPoison = createNewGame('主角');
    noPoison.inventory.items.push({ id: '36', name: '解毒丸', count: 1 });
    expect(useItem(noPoison, '解毒丸').message).toContain('没有中毒');

    const fullMp = createNewGame('主角');
    fullMp.inventory.items.push({ id: '31', name: '小还丹', count: 1 });
    expect(useItem(fullMp, '小还丹').message).toContain('当前无需使用');

    const fullStamina = createNewGame('主角');
    fullStamina.inventory.items = [{ id: '35', name: '干粮', count: 1 }];
    expect(useItem(fullStamina, '干粮').message).toContain('当前无需使用');
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
    const { state, isNewGame } = loadOrCreateGame(createNewGame, '新手');
    expect(state.character.name).toBe('新手');
    expect(isNewGame).toBe(true);
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

  it('rejects actions when dead including rest revival', () => {
    const state = createNewGame('主角');
    state.character.hp = 0;
    expect(rest(state).success).toBe(false);
    expect(state.character.hp).toBe(0);
    expect(moveTo(state, '平安镇').success).toBe(false);
    expect(startBattle(state, '山贼').success).toBe(false);
    expect(buyItem(state, '金创药').success).toBe(false);
  });

  it('moveTo rejects when stamina insufficient', () => {
    const state = createNewGame('主角');
    state.character.stamina = 0;
    expect(moveTo(state, '平安镇').success).toBe(false);
    expect(state.location).toBe('小村');
  });

  it('useItem applies buff pills and skill books', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '37', name: '大力丸', count: 1 });
    const pill = useItem(state, '大力丸');
    expect(pill.success).toBe(true);
    expect(state.character.buffs?.attack).toBe(20);

    state.inventory.items.push({ id: '38', name: '疾风丸', count: 1 });
    useItem(state, '疾风丸');
    expect(state.character.buffs?.agility).toBe(20);

    state.character.attributes.iq = 100;
    state.character.exp = 2000;
    state.inventory.items.push({ id: '42', name: '独孤九剑剑谱', count: 1 });
    const book = useItem(state, '独孤九剑剑谱');
    expect(book.success).toBe(true);
    expect(state.character.skills).toContain('独孤九剑');
  });

  it('enemyAttack from snake applies poison debuff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    const battle = startBattle(state, '毒蛇');
    enemyAttack(state, battle.enemies!);
    expect(state.character.poison).toBe(15);
    expect(enemyAttack(state, battle.enemies!).message).toContain('麻痹');
  });

  it('useSkillInBattle grants skill exp and can level up skill', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 200;
    state.character.skillExp = { 基本拳法: 99 };
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '基本拳法', 0);
    expect(state.character.skillLevels['基本拳法']).toBe(1);
    expect(state.character.skillExp!['基本拳法']).toBeLessThan(100);
  });

  it('grantBattleExp uses integer exp values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    enemies[0].hp = 1;
    attackEnemy(state, enemies, 0);
    expect(Number.isInteger(state.character.exp)).toBe(true);
  });

  it('covers skill battle branches: heal, depoison, absorb, poison', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 500;
    state.character.stamina = 100;
    learnSkill(state, '医疗术');
    learnSkill(state, '解毒术');
    learnSkill(state, '北冥神功');
    learnSkill(state, '用毒术');

    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;

    state.character.hp = 50;
    const heal = useSkillInBattle(state, enemies, '医疗术', 0);
    expect(heal.success).toBe(true);
    expect(heal.message).toContain('恢复');

    state.character.poison = 30;
    const cure = useSkillInBattle(state, enemies, '解毒术', 0);
    expect(cure.success).toBe(true);
    expect(cure.message).toContain('毒素');

    state.character.mp = 10;
    const absorb = useSkillInBattle(state, enemies, '北冥神功', 0);
    expect(absorb.success).toBe(true);
    expect(absorb.message).toContain('吸取');

    const poison = useSkillInBattle(state, enemies, '用毒术', 0);
    expect(poison.success).toBe(true);
    expect(poison.message).toContain('剧毒');
  });

  it('covers heal at full hp and depoison when not poisoned', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 200;
    learnSkill(state, '医疗术');
    learnSkill(state, '解毒术');
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '医疗术', 0);
    const noHeal = useSkillInBattle(state, battle.enemies!, '医疗术', 0);
    expect(noHeal.message).toContain('气血已足');

    const noPoison = useSkillInBattle(state, battle.enemies!, '解毒术', 0);
    expect(noPoison.message).toContain('并未中毒');
  });

  it('enemyAttack when player dead returns early', () => {
    const state = createNewGame('主角');
    state.character.hp = 0;
    const battle = startBattle(state, '山贼');
    expect(enemyAttack(state, battle.enemies!).playerDefeated).toBe(true);
  });

  it('enemyAttack from tiger applies hurt debuff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    const battle = startBattle(state, '老虎');
    enemyAttack(state, battle.enemies!);
    expect(state.character.hurt).toBe(10);
    expect(enemyAttack(state, battle.enemies!).message).toContain('内伤');
  });

  it('rejects attack and skill when stamina insufficient', () => {
    const state = createNewGame('主角');
    state.character.stamina = 0;
    const battle = startBattle(state, '山贼');
    const enemies = battle.enemies!;
    expect(attackEnemy(state, enemies, 0).message).toContain('体力不足');
    expect(useSkillInBattle(state, enemies, '基本拳法', 0).message).toContain('体力不足');
  });

  it('buyItem rejects when inventory type cap reached', () => {
    const state = createNewGame('主角');
    state.inventory.silver = 99999;
    moveTo(state, '平安镇');
    for (let i = 0; i < 100; i++) {
      state.inventory.items.push({ id: String(i), name: `物品${i}`, count: 1 });
    }
    expect(buyItem(state, '铁剑').success).toBe(false);
  });

  it('useItem skill book rejects unmet requirements', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '40', name: '九阴真经', count: 1 });
    expect(useItem(state, '九阴真经').success).toBe(false);

    state.character.attributes.iq = 100;
    expect(useItem(state, '九阴真经').success).toBe(false);

    state.character.exp = 2000;
    useItem(state, '九阴真经');
    state.inventory.items.push({ id: '40', name: '九阴真经', count: 1 });
    expect(useItem(state, '九阴真经').message).toContain('已经学会');
  });

  it('useItem rejects duplicate buff pills', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '37', name: '大力丸', count: 2 });
    useItem(state, '大力丸');
    expect(useItem(state, '大力丸').message).toContain('效果仍在');
  });

  it('useItem rejects duplicate agility buff', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '38', name: '疾风丸', count: 2 });
    useItem(state, '疾风丸');
    expect(useItem(state, '疾风丸').message).toContain('效果仍在');
  });

  it('resolveEnemyTemplateName matches numbered enemy names', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = createNewGame('主角');
    const battle = startBattle(state, '山贼');
    expect(battle.enemies!.length).toBeGreaterThan(1);
    enemyAttack(state, battle.enemies!);
    expect(state.character.hp).toBeLessThan(100);
  });

  it('enemyAttack handles unknown enemy template names', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    enemyAttack(state, [{ name: '神秘怪', hp: 10, maxHp: 10, attack: 5, defence: 0 }]);
    expect(state.character.hp).toBeLessThan(100);
  });

  it('rejects equip and learn when dead', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '10', name: '铁剑', count: 1 });
    state.character.hp = 0;
    expect(equipItem(state, '铁剑').success).toBe(false);
    expect(learnSkill(state, '六脉神剑').success).toBe(false);
  });

  it('skill exp stops at max skill level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 500;
    state.character.skillLevels['基本拳法'] = 9;
    state.character.skillExp = { 基本拳法: 50 };
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '基本拳法', 0);
    expect(state.character.skillLevels['基本拳法']).toBe(9);
    expect(state.character.skillExp!['基本拳法']).toBe(50);
  });

  it('useItem rejects skill book with missing skill data', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '99', name: '假经书', count: 1 });
    vi.spyOn(configLoader, 'getItem').mockReturnValue({
      id: 99,
      name: '假经书',
      desc: '',
      type: 2,
      equipmentType: -1,
      price: 0,
      addAttack: 0,
      addDefence: 0,
      useAddHp: 0,
      useAddMp: 0,
      useAddStamina: 0,
      useDePoison: 0,
      skillId: 9999,
    });
    vi.spyOn(configLoader, 'getSkillById').mockReturnValue(undefined);
    expect(useItem(state, '假经书').success).toBe(false);
    expect(useItem(state, '假经书').message).toContain('内容残缺');
  });

  it('useSkillInBattle rejects when player is dead', () => {
    const state = createNewGame('主角');
    state.character.hp = 0;
    const battle = startBattle(state, '山贼');
    expect(useSkillInBattle(state, battle.enemies!, '基本拳法', 0).success).toBe(false);
  });

  it('skill exp levels up multiple tiers in one use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 500;
    state.character.skillExp = { 基本拳法: 295 };
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '基本拳法', 0);
    expect(state.character.skillLevels['基本拳法']).toBe(2);
  });

  it('rejects useItem when dead', () => {
    const state = createNewGame('主角');
    state.character.hp = 0;
    state.inventory.items.push({ id: '30', name: '金创药', count: 1 });
    expect(useItem(state, '金创药').success).toBe(false);
  });

  it('attackEnemy rejects when player is dead', () => {
    const state = createNewGame('主角');
    state.character.hp = 0;
    const enemies = [{ name: '山贼', hp: 80, maxHp: 80, attack: 10, defence: 5 }];
    expect(attackEnemy(state, enemies, 0).message).toContain('昏迷');
  });

  it('buyItem stacks existing item even near inventory cap', () => {
    const state = createNewGame('主角');
    state.inventory.silver = 99999;
    state.inventory.items = [{ id: '10', name: '铁剑', count: 1 }];
    for (let i = 0; i < 99; i++) {
      state.inventory.items.push({ id: String(i + 100), name: `物品${i}`, count: 1 });
    }
    moveTo(state, '平安镇');
    expect(state.inventory.items.length).toBe(100);
    expect(buyItem(state, '铁剑').success).toBe(true);
    expect(state.inventory.items.find((i) => i.name === '铁剑')!.count).toBe(2);
  });

  it('absorb skill skips extra message when absorb is zero', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createNewGame('主角');
    learnSkill(state, '北冥神功');
    state.character.mp = 50;
    state.character.stamina = 100;
    const enemies = [{ name: '高手', hp: 80, maxHp: 80, attack: 10, defence: 999 }];
    const msg = useSkillInBattle(state, enemies, '北冥神功', 0).message;
    expect(msg).not.toContain('吸取');
  });

  it('getStatus shows temporary buff lines', () => {
    const state = createNewGame('主角');
    state.inventory.items.push({ id: '37', name: '大力丸', count: 1 });
    state.inventory.items.push({ id: '38', name: '疾风丸', count: 1 });
    useItem(state, '大力丸');
    useItem(state, '疾风丸');
    const status = getStatus(state);
    expect(status).toContain('攻加成');
    expect(status).toContain('轻功加成');
  });

  it('buyItem rejects new item type when inventory full', () => {
    const state = createNewGame('主角');
    state.inventory.silver = 99999;
    state.inventory.items = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `物品${i}`,
      count: 1,
    }));
    moveTo(state, '平安镇');
    expect(buyItem(state, '铁剑').success).toBe(false);
  });

  it('moveTo without encounter leaves encounter undefined', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = createNewGame('主角');
    moveTo(state, '山洞');
    const result = moveTo(state, '小村');
    expect(result.encounter).toBeUndefined();
  });

  it('useItem initializes buffs object when missing', () => {
    const state = createNewGame('主角');
    delete state.character.buffs;
    state.inventory.items.push({ id: '30', name: '金创药', count: 1 });
    state.character.hp = 50;
    useItem(state, '金创药');
    expect(state.character.buffs).toEqual({});
  });

  it('learnSkill initializes skillExp when missing', () => {
    const state = createNewGame('主角');
    delete state.character.skillExp;
    learnSkill(state, '六脉神剑');
    expect(state.character.skillExp?.['六脉神剑']).toBe(0);
  });

  it('advanceWeek clears temporary buffs', () => {
    const state = createNewGame('主角');
    state.character.buffs = { attack: 20 };
    advanceWeek(state);
    expect(state.character.buffs).toEqual({});
  });

  it('consumeItemStack no-ops when item missing from inventory', () => {
    const state = createNewGame('主角');
    consumeItemStack(state, '不存在');
    expect(state.inventory.items.length).toBeGreaterThan(0);
  });

  it('useItem skill book skips iq and exp checks when requirements omitted', () => {
    const state = createNewGame('主角');
    state.character.skills = state.character.skills.filter((s) => s !== '基本拳法');
    state.inventory.items.push({ id: '99', name: '测试秘籍', count: 1 });
    const template = configLoader.getItem('金创药')!;
    const { needIQ: _iq, needExp: _exp, ...baseTemplate } = template;
    const originalGetItem = configLoader.getItem;
    vi.spyOn(configLoader, 'getItem').mockImplementation((name) => {
      if (name === '测试秘籍') {
        return {
          ...baseTemplate,
          id: 99,
          name: '测试秘籍',
          type: 2,
          skillId: 1,
          useAddHp: 0,
        };
      }
      return originalGetItem(name);
    });
    const result = useItem(state, '测试秘籍');
    expect(result.success).toBe(true);
    expect(state.character.skills).toContain('基本拳法');
  });

  it('useItem handles consumables without optional buff fields', () => {
    const state = createNewGame('主角');
    state.character.hp = 50;
    state.inventory.items.push({ id: '30', name: '简药', count: 1 });
    const template = configLoader.getItem('金创药')!;
    const { useAddAttack: _a, useAddAgility: _g, ...minimal } = template;
    const originalGetItem = configLoader.getItem;
    vi.spyOn(configLoader, 'getItem').mockImplementation((name) => {
      if (name === '简药') return { ...minimal, name: '简药', useAddHp: 50 };
      return originalGetItem(name);
    });
    expect(useItem(state, '简药').success).toBe(true);
    expect(state.character.hp).toBe(100);
  });

  it('grantSkillExp uses existing skill level entry in while loop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 500;
    state.character.skillLevels = { 基本拳法: 7 };
    state.character.skillExp = { 基本拳法: 199 };
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '基本拳法', 0);
    expect(state.character.skillLevels['基本拳法']).toBe(9);
    expect(state.character.skillExp['基本拳法']).toBe(3);
  });

  it('grantSkillExp initializes missing skill level during level-up loop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const state = createNewGame('主角');
    state.character.mp = 500;
    delete state.character.skillLevels['基本拳法'];
    state.character.skillExp = { 基本拳法: 199 };
    const battle = startBattle(state, '山贼');
    useSkillInBattle(state, battle.enemies!, '基本拳法', 0);
    expect(state.character.skillLevels['基本拳法']).toBe(2);
    expect(state.character.skillExp['基本拳法']).toBe(3);
  });
});
