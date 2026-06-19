/**
 * 金庸群侠传 · 游戏引擎
 *
 * 智能体唯一入口：所有游戏操作通过本文件导出函数执行。
 */

import {
  calculateDamage as calcDamage,
  getExpForLevel,
  calculateMpCost,
  calculatePoisonDamage,
  calculateHurtDamage,
  DEFAULT_ATTRIBUTES,
  MAX_STAMINA,
} from './game-logic';
import {
  initConfigs,
  getTemplates,
  getMap,
  getItem,
  getSkill,
  getSkillAttackAtLevel,
  getDialog,
  getEnemyTemplate,
  isWeapon,
  isArmor,
  isConsumable,
} from './config-loader';
import type { GameState, BattleEnemy, Character } from './game-types';
import {
  loadGameState,
  saveGameState,
  deleteSave,
  loadOrCreateGame,
  getSavePath,
} from './persistence';

export type { GameState, BattleEnemy, Character };
export { loadGameState, saveGameState, deleteSave, loadOrCreateGame, getSavePath };

initConfigs();

function autoSave(state: GameState): void {
  saveGameState(state);
}

// ============================================================================
// 初始化
// ============================================================================

function buildCharacter(name: string): Character {
  const tpl = getTemplates();
  const attrs = { ...DEFAULT_ATTRIBUTES };
  return {
    name,
    level: 1,
    exp: 0,
    hp: attrs.maxHp,
    maxHp: attrs.maxHp,
    mp: attrs.maxMp,
    maxMp: attrs.maxMp,
    stamina: MAX_STAMINA,
    poison: 0,
    hurt: 0,
    attributes: attrs,
    equipment: { weapon: null, armor: null },
    skills: [...(tpl.defaultCharacter.skills ?? ['基本拳法'])],
    skillLevels: Object.fromEntries(
      (tpl.defaultCharacter.skills ?? ['基本拳法']).map((s) => [s, 0]),
    ),
  };
}

export function createNewGame(name: string): GameState {
  const tpl = getTemplates();
  return {
    character: buildCharacter(name),
    team: [],
    inventory: {
      silver: tpl.defaultInventory.silver,
      items: tpl.defaultInventory.items.map((i) => ({ ...i })),
    },
    location: tpl.startLocation ?? '小村',
    week: 1,
    flags: {},
    visitedMaps: [tpl.startLocation ?? '小村'],
    completedQuests: [],
  };
}

// ============================================================================
// 状态查询
// ============================================================================

export function getStatus(state: GameState): string {
  const c = state.character;
  return [
    `👤 ${c.name} | Lv.${c.level} | 经验: ${c.exp}/${getExpForLevel(c.level + 1)}`,
    `❤️ ${c.hp}/${c.maxHp} | 💠 ${c.mp}/${c.maxMp} | ⚡ ${c.stamina}/${MAX_STAMINA}`,
    c.poison > 0 ? `🧪 中毒: ${c.poison}` : null,
    c.hurt > 0 ? `💊 受伤: ${c.hurt}` : null,
    `💰 ${state.inventory.silver} | 📍 ${state.location} | 📅 第${state.week}周`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function getInventory(state: GameState): string {
  const items = state.inventory.items;
  if (items.length === 0) return `💰 银两: ${state.inventory.silver}\n\n📦 背包空空如也`;

  const lines = items.map((i) => `- ${i.name} ×${i.count}`);
  return `💰 银两: ${state.inventory.silver}\n\n📦 物品:\n${lines.join('\n')}`;
}

export function getSkills(state: GameState): string {
  const skills = state.character.skills;
  if (skills.length === 0) return '🥋 还没有学会任何武功';
  return `🥋 武功:\n${skills.map((s) => `- ${s}`).join('\n')}`;
}

// ============================================================================
// 移动
// ============================================================================

export function moveTo(
  state: GameState,
  destination: string,
): { success: boolean; message: string } {
  const map = getMap(state.location);
  if (!map) return { success: false, message: '当前位置未知' };

  if (destination === 'random') {
    if (map.connections.length === 0) {
      return { success: false, message: '无处可去' };
    }
    destination = map.connections[Math.floor(Math.random() * map.connections.length)];
  }

  if (!map.connections.includes(destination)) {
    return { success: false, message: `从${state.location}无法直达${destination}` };
  }

  state.location = destination;
  state.character.stamina = Math.max(0, state.character.stamina - 5);
  state.week++;
  advanceWeekEffects(state);

  if (!state.visitedMaps.includes(destination)) {
    state.visitedMaps.push(destination);
  }

  autoSave(state);
  return { success: true, message: `你来到了${destination}` };
}

// ============================================================================
// NPC 交互
// ============================================================================

export function talkTo(state: GameState, npcName: string): { success: boolean; message: string } {
  const map = getMap(state.location);
  if (!map) return { success: false, message: '当前位置未知' };

  if (npcName === 'random') {
    if (map.npcs.length === 0) return { success: false, message: '这里没有人' };
    npcName = map.npcs[Math.floor(Math.random() * map.npcs.length)];
  }

  if (!map.npcs.includes(npcName)) {
    return { success: false, message: `${state.location}没有${npcName}` };
  }

  const dialogId = map.npcDialogs[npcName];
  if (dialogId) {
    const dialog = getDialog(dialogId);
    if (dialog) {
      return { success: true, message: `${dialog.speaker}：「${dialog.text}」` };
    }
  }

  return { success: true, message: `你和${npcName}聊了起来` };
}

// ============================================================================
// 商店
// ============================================================================

export function buyItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = getItem(itemName);
  if (!item) return { success: false, message: `没有${itemName}出售` };

  const map = getMap(state.location);
  if (!map || !map.shops.includes(itemName)) {
    return { success: false, message: `${state.location}没有卖${itemName}` };
  }

  if (state.inventory.silver < item.price) {
    return {
      success: false,
      message: `银两不足，需要${item.price}，只有${state.inventory.silver}`,
    };
  }

  state.inventory.silver -= item.price;
  const existing = state.inventory.items.find((i) => i.name === itemName);
  if (existing) {
    existing.count++;
  } else {
    state.inventory.items.push({
      id: String(item.id),
      name: itemName,
      count: 1,
    });
  }

  autoSave(state);
  return { success: true, message: `购买了${itemName}，花费${item.price}银两` };
}

// ============================================================================
// 物品
// ============================================================================

export function useItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const inv = state.inventory.items.find((i) => i.name === itemName);
  if (!inv || inv.count <= 0) {
    return { success: false, message: `没有${itemName}` };
  }

  const item = getItem(itemName);
  if (!item || !isConsumable(item)) {
    return { success: false, message: `${itemName}无法使用` };
  }

  const parts: string[] = [];
  if (item.useAddHp > 0) {
    healHp(state, item.useAddHp);
    parts.push(`恢复${item.useAddHp}生命`);
  }
  if (item.useAddMp > 0) {
    healMp(state, item.useAddMp);
    parts.push(`恢复${item.useAddMp}内力`);
  }
  if (item.useAddStamina > 0) {
    healStamina(state, item.useAddStamina);
    parts.push(`恢复${item.useAddStamina}体力`);
  }
  if (item.useDePoison > 0) {
    dePoison(state, item.useDePoison);
    parts.push('解除中毒');
  }

  inv.count--;
  if (inv.count <= 0) {
    state.inventory.items = state.inventory.items.filter((i) => i.name !== itemName);
  }

  autoSave(state);
  return { success: true, message: `使用${itemName}，${parts.join('，')}` };
}

// ============================================================================
// 装备
// ============================================================================

export function equipItem(
  state: GameState,
  itemName: string,
): { success: boolean; message: string } {
  const inv = state.inventory.items.find((i) => i.name === itemName);
  if (!inv || inv.count <= 0) {
    return { success: false, message: `没有${itemName}` };
  }

  const item = getItem(itemName);
  if (!item) return { success: false, message: `未知物品${itemName}` };

  if (isWeapon(item)) {
    state.character.equipment.weapon = itemName;
    autoSave(state);
    return { success: true, message: `装备了${itemName}` };
  }

  if (isArmor(item)) {
    state.character.equipment.armor = itemName;
    autoSave(state);
    return { success: true, message: `装备了${itemName}` };
  }

  return { success: false, message: `${itemName}不可装备` };
}

// ============================================================================
// 武功
// ============================================================================

export function learnSkill(
  state: GameState,
  skillName: string,
): { success: boolean; message: string } {
  if (!getSkill(skillName)) {
    return { success: false, message: `江湖上没有${skillName}这门武功` };
  }
  if (state.character.skills.includes(skillName)) {
    return { success: false, message: `已经学会了${skillName}` };
  }

  state.character.skills.push(skillName);
  state.character.skillLevels[skillName] = 0;
  autoSave(state);
  return { success: true, message: `学会了${skillName}` };
}

// ============================================================================
// 休息
// ============================================================================

export function rest(state: GameState): { success: boolean; message: string } {
  state.character.hp = state.character.maxHp;
  state.character.mp = state.character.maxMp;
  state.character.stamina = MAX_STAMINA;
  state.character.poison = 0;
  state.character.hurt = 0;

  autoSave(state);
  return { success: true, message: '休息完毕，状态全满' };
}

// ============================================================================
// 战斗
// ============================================================================

export function startBattle(
  state: GameState,
  enemyName: string,
): { success: boolean; message: string; enemies?: BattleEnemy[] } {
  const entry = getTemplates().enemies[enemyName];
  const template = getEnemyTemplate(enemyName);
  if (!template) {
    return { success: false, message: `没有遇到${enemyName}` };
  }

  const solo =
    (entry && 'solo' in entry && entry.solo === true) ||
    enemyName === '老虎' ||
    enemyName === '毒蛇';
  const count = solo ? 1 : Math.floor(Math.random() * 3) + 1;
  const enemies: BattleEnemy[] = Array.from({ length: count }, (_, i) => ({
    name: count === 1 ? enemyName : `${enemyName}${i + 1}`,
    hp: template.hp,
    maxHp: template.hp,
    attack: template.attack,
    defence: template.defence,
  }));

  return { success: true, message: `⚔️ 遭遇${count}个${enemyName}！`, enemies };
}

export function attackEnemy(
  state: GameState,
  enemies: BattleEnemy[],
  targetIndex: number,
): { message: string; enemyDefeated: boolean; playerDamage: number } {
  const target = enemies[targetIndex];
  if (!target || target.hp <= 0) {
    return { message: '目标无效', enemyDefeated: false, playerDamage: 0 };
  }

  const damage = calcDamage(
    getEffectiveAttack(state),
    0,
    target.defence,
    state.character.attributes.ambidextrous,
    state.character.attributes.martialKnowledge,
  );

  target.hp = Math.max(0, target.hp - damage);
  state.character.stamina = Math.max(0, state.character.stamina - 3);

  const defeated = target.hp <= 0;
  if (defeated) {
    grantBattleExp(state, target.maxHp);
  }

  autoSave(state);
  return {
    message: `攻击${target.name}，造成${damage}点伤害${defeated ? '，击败！' : ''}`,
    enemyDefeated: defeated,
    playerDamage: 0,
  };
}

export function useSkillInBattle(
  state: GameState,
  enemies: BattleEnemy[],
  skillName: string,
  targetIndex: number,
): { success: boolean; message: string } {
  if (!state.character.skills.includes(skillName)) {
    return { success: false, message: `没有学会${skillName}` };
  }

  const skill = getSkill(skillName);
  if (!skill) return { success: false, message: `未知武功${skillName}` };

  const target = enemies[targetIndex];
  if (!target || target.hp <= 0) {
    return { success: false, message: '目标无效' };
  }

  const levelIndex = state.character.skillLevels[skillName] ?? 0;
  const mpCost = calculateMpCost(skill.mpCost, levelIndex);
  if (state.character.mp < mpCost) {
    return { success: false, message: `内力不足，需要${mpCost}点内力` };
  }

  const skillAttack = getSkillAttackAtLevel(skillName, levelIndex);
  const damage = calcDamage(
    getEffectiveAttack(state),
    skillAttack,
    target.defence,
    state.character.attributes.ambidextrous,
    state.character.attributes.martialKnowledge,
  );

  target.hp = Math.max(0, target.hp - damage);
  state.character.mp = Math.max(0, state.character.mp - mpCost);
  state.character.stamina = Math.max(0, state.character.stamina - 3);

  const defeated = target.hp <= 0;
  if (defeated) {
    grantBattleExp(state, target.maxHp);
  }

  autoSave(state);
  return {
    success: true,
    message: `使用${skillName}攻击${target.name}，造成${damage}点伤害${defeated ? '，击败！' : ''}`,
  };
}

export function enemyAttack(
  state: GameState,
  enemies: BattleEnemy[],
): { message: string; playerDefeated: boolean } {
  const aliveEnemies = enemies.filter((e) => e.hp > 0);
  if (aliveEnemies.length === 0) return { message: '', playerDefeated: false };

  const enemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
  const damage = Math.max(1, enemy.attack - getEffectiveDefence(state));

  state.character.hp = Math.max(0, state.character.hp - damage);

  autoSave(state);
  return {
    message: `${enemy.name}攻击你，造成${damage}点伤害`,
    playerDefeated: state.character.hp <= 0,
  };
}

// ============================================================================
// 状态辅助（原 game-state.ts 合并）
// ============================================================================

export function advanceWeek(state: GameState): void {
  state.week++;
  advanceWeekEffects(state);
  autoSave(state);
}

function advanceWeekEffects(state: GameState): void {
  if (state.character.poison > 0) {
    const dmg = calculatePoisonDamage(state.character.poison);
    state.character.hp = Math.max(1, state.character.hp - dmg);
  }
  if (state.character.hurt > 0) {
    const dmg = calculateHurtDamage(state.character.hurt);
    state.character.hp = Math.max(1, state.character.hp - dmg);
  }
}

export function isDead(state: GameState): boolean {
  return state.character.hp <= 0;
}

// ============================================================================
// 内部
// ============================================================================

function getEffectiveAttack(state: GameState): number {
  let attack = state.character.attributes.attack;
  const weapon = state.character.equipment.weapon;
  if (weapon) {
    const item = getItem(weapon);
    if (item) attack += item.addAttack;
  }
  return attack;
}

function getEffectiveDefence(state: GameState): number {
  let defence = state.character.attributes.defence;
  const armor = state.character.equipment.armor;
  if (armor) {
    const item = getItem(armor);
    if (item) defence += item.addDefence;
  }
  return defence;
}

function grantBattleExp(state: GameState, enemyMaxHp: number): void {
  state.character.exp += 10 + enemyMaxHp / 10;
  checkLevelUp(state);
}

function checkLevelUp(state: GameState): void {
  const c = state.character;
  let needed = getExpForLevel(c.level + 1);

  while (c.exp >= needed && c.level < 100) {
    c.level++;
    c.exp -= needed;

    const iq = c.attributes.iq;
    const attrGain = Math.floor(Math.random() * (Math.floor((iq - 10) / 20) + 2)) + 1;

    c.maxHp += (c.attributes.hpInc + Math.floor(Math.random() * 4)) * 3;
    c.maxMp += (9 - attrGain) * 4;
    c.attributes.attack += attrGain;
    c.attributes.agility += attrGain;
    c.attributes.defence += attrGain;

    c.hp = c.maxHp;
    c.mp = c.maxMp;
    needed = getExpForLevel(c.level + 1);
  }
}

function healHp(state: GameState, amount: number): void {
  state.character.hp = Math.min(state.character.maxHp, state.character.hp + amount);
}

function healMp(state: GameState, amount: number): void {
  state.character.mp = Math.min(state.character.maxMp, state.character.mp + amount);
}

function healStamina(state: GameState, amount: number): void {
  state.character.stamina = Math.min(MAX_STAMINA, state.character.stamina + amount);
}

function dePoison(state: GameState, amount: number): void {
  state.character.poison = Math.max(0, state.character.poison - amount);
}
