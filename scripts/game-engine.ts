/**
 * 金庸群侠传 · 游戏引擎
 * 
 * 智能体调用这些函数，代码负责具体逻辑。
 */

import { DEFAULT_ATTRIBUTES, MAX_STAMINA } from './game-logic'
import {
  calculateDamage as _calcDamage,
  calculatePoisonDamage,
  calculateHurtDamage,
  getExpForLevel,
  calculateMpCost as _calcMpCost,
  calculateStaminaCost,
  calculateMovePoints,
} from './game-logic'

// ============================================================================
// 类型
// ============================================================================

export interface GameState {
  character: Character
  team: string[]
  inventory: Inventory
  location: string
  week: number
  flags: Record<string, boolean | number>
  visitedMaps: string[]
  completedQuests: string[]
}

export interface Character {
  name: string
  level: number
  exp: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  poison: number
  hurt: number
  attributes: typeof DEFAULT_ATTRIBUTES
  equipment: { weapon: string | null; armor: string | null }
  skills: string[]
}

export interface Inventory {
  silver: number
  items: Array<{ id: string; name: string; count: number }>
}

// ============================================================================
// 初始化
// ============================================================================

export function createNewGame(name: string): GameState {
  return {
    character: {
      name,
      level: 1,
      exp: 0,
      hp: DEFAULT_ATTRIBUTES.maxHp,
      maxHp: DEFAULT_ATTRIBUTES.maxHp,
      mp: DEFAULT_ATTRIBUTES.maxMp,
      maxMp: DEFAULT_ATTRIBUTES.maxMp,
      stamina: MAX_STAMINA,
      poison: 0,
      hurt: 0,
      attributes: { ...DEFAULT_ATTRIBUTES },
      equipment: { weapon: null, armor: null },
      skills: ['基本拳法'],
    },
    team: [],
    inventory: {
      silver: 100,
      items: [
        { id: '30', name: '金创药', count: 5 },
        { id: '35', name: '干粮', count: 3 },
      ],
    },
    location: '小村',
    week: 1,
    flags: {},
    visitedMaps: ['小村'],
    completedQuests: [],
  }
}

// ============================================================================
// 状态查询
// ============================================================================

export function getStatus(state: GameState): string {
  const c = state.character
  return [
    `👤 ${c.name} | Lv.${c.level} | 经验: ${c.exp}/${getExpForLevel(c.level + 1)}`,
    `❤️ ${c.hp}/${c.maxHp} | 💠 ${c.mp}/${c.maxMp} | ⚡ ${c.stamina}/${MAX_STAMINA}`,
    c.poison > 0 ? `🧪 中毒: ${c.poison}` : null,
    c.hurt > 0 ? `💊 受伤: ${c.hurt}` : null,
    `💰 ${state.inventory.silver} | 📍 ${state.location} | 📅 第${state.week}周`,
  ].filter(Boolean).join('\n')
}

export function getInventory(state: GameState): string {
  const items = state.inventory.items
  if (items.length === 0) return `💰 银两: ${state.inventory.silver}\n\n📦 背包空空如也`
  
  const lines = items.map(i => `- ${i.name} ×${i.count}`)
  return `💰 银两: ${state.inventory.silver}\n\n📦 物品:\n${lines.join('\n')}`
}

export function getSkills(state: GameState): string {
  const skills = state.character.skills
  if (skills.length === 0) return '🥋 还没有学会任何武功'
  return `🥋 武功:\n${skills.map(s => `- ${s}`).join('\n')}`
}

// ============================================================================
// 移动
// ============================================================================

export const MAPS: Record<string, { npcs: string[]; shops: string[]; connections: string[] }> = {
  '小村': { npcs: ['村长', '商人'], shops: ['金创药', '小还丹', '干粮'], connections: ['平安镇', '山洞'] },
  '平安镇': { npcs: ['守卫', '商店老板', '客栈老板'], shops: ['铁剑', '钢刀', '布衣', '皮甲', '金创药', '小还丹'], connections: ['小村', '华山', '桃花岛', '全真教', '光明顶'] },
  '山洞': { npcs: ['神秘人'], shops: [], connections: ['小村'] },
  '华山': { npcs: ['王重阳'], shops: [], connections: ['平安镇'] },
  '桃花岛': { npcs: ['黄药师', '黄蓉'], shops: [], connections: ['平安镇'] },
  '全真教': { npcs: ['王重阳', '周伯通'], shops: [], connections: ['平安镇'] },
  '光明顶': { npcs: ['张无忌'], shops: [], connections: ['平安镇'] },
}

export function moveTo(state: GameState, destination: string): { success: boolean; message: string } {
  const map = MAPS[state.location]
  if (!map) return { success: false, message: '当前位置未知' }
  
  if (destination === 'random') {
    const options = map.connections
    destination = options[Math.floor(Math.random() * options.length)]
  }
  
  if (!map.connections.includes(destination)) {
    return { success: false, message: `从${state.location}无法直达${destination}` }
  }
  
  state.location = destination
  state.character.stamina = Math.max(0, state.character.stamina - 5)
  state.week++
  
  if (!state.visitedMaps.includes(destination)) {
    state.visitedMaps.push(destination)
  }
  
  return { success: true, message: `你来到了${destination}` }
}

// ============================================================================
// NPC 交互
// ============================================================================

export function talkTo(state: GameState, npcName: string): { success: boolean; message: string } {
  const map = MAPS[state.location]
  if (!map) return { success: false, message: '当前位置未知' }
  
  if (npcName === 'random') {
    if (map.npcs.length === 0) return { success: false, message: '这里没有人' }
    npcName = map.npcs[Math.floor(Math.random() * map.npcs.length)]
  }
  
  if (!map.npcs.includes(npcName)) {
    return { success: false, message: `${state.location}没有${npcName}` }
  }
  
  return { success: true, message: `你和${npcName}聊了起来` }
}

// ============================================================================
// 商店
// ============================================================================

export const ITEMS: Record<string, { type: string; price: number; effect: string }> = {
  '铁剑': { type: 'weapon', price: 100, effect: '攻击+10' },
  '钢刀': { type: 'weapon', price: 200, effect: '攻击+20' },
  '布衣': { type: 'armor', price: 50, effect: '防御+5' },
  '皮甲': { type: 'armor', price: 200, effect: '防御+15' },
  '金创药': { type: 'consumable', price: 20, effect: '恢复50生命' },
  '大还丹': { type: 'consumable', price: 100, effect: '恢复150生命' },
  '小还丹': { type: 'consumable', price: 30, effect: '恢复50内力' },
  '干粮': { type: 'consumable', price: 5, effect: '恢复20体力' },
  '解毒丸': { type: 'consumable', price: 50, effect: '解毒50' },
}

export function buyItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = ITEMS[itemName]
  if (!item) return { success: false, message: `没有${itemName}出售` }
  
  const map = MAPS[state.location]
  if (!map || !map.shops.includes(itemName)) {
    return { success: false, message: `${state.location}没有卖${itemName}` }
  }
  
  if (state.inventory.silver < item.price) {
    return { success: false, message: `银两不足，需要${item.price}，只有${state.inventory.silver}` }
  }
  
  state.inventory.silver -= item.price
  const existing = state.inventory.items.find(i => i.name === itemName)
  if (existing) {
    existing.count++
  } else {
    state.inventory.items.push({ id: itemName, name: itemName, count: 1 })
  }
  
  return { success: true, message: `购买了${itemName}，花费${item.price}银两` }
}

// ============================================================================
// 使用物品
// ============================================================================

export function useItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = state.inventory.items.find(i => i.name === itemName)
  if (!item || item.count <= 0) {
    return { success: false, message: `没有${itemName}` }
  }
  
  const effects: Record<string, () => string> = {
    '金创药': () => { healHp(state, 50); return '恢复50生命' },
    '大还丹': () => { healHp(state, 150); return '恢复150生命' },
    '小还丹': () => { healMp(state, 50); return '恢复50内力' },
    '干粮': () => { healStamina(state, 20); return '恢复20体力' },
    '解毒丸': () => { dePoison(state, 50); return '解除中毒' },
  }
  
  const effect = effects[itemName]
  if (!effect) return { success: false, message: `${itemName}无法使用` }
  
  item.count--
  if (item.count <= 0) {
    state.inventory.items = state.inventory.items.filter(i => i.name !== itemName)
  }
  
  const result = effect()
  return { success: true, message: `使用${itemName}，${result}` }
}

// ============================================================================
// 装备
// ============================================================================

export function equipItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = state.inventory.items.find(i => i.name === itemName)
  if (!item || item.count <= 0) {
    return { success: false, message: `没有${itemName}` }
  }
  
  const weaponNames = ['铁剑', '钢刀', '玄铁剑', '倚天剑', '屠龙刀']
  const armorNames = ['布衣', '皮甲', '金丝甲', '软猬甲']
  
  if (weaponNames.includes(itemName)) {
    state.character.equipment.weapon = itemName
    return { success: true, message: `装备了${itemName}` }
  }
  
  if (armorNames.includes(itemName)) {
    state.character.equipment.armor = itemName
    return { success: true, message: `装备了${itemName}` }
  }
  
  return { success: false, message: `${itemName}不可装备` }
}

// ============================================================================
// 学习武功
// ============================================================================

export function learnSkill(state: GameState, skillName: string): { success: boolean; message: string } {
  if (state.character.skills.includes(skillName)) {
    return { success: false, message: `已经学会了${skillName}` }
  }
  
  state.character.skills.push(skillName)
  return { success: true, message: `学会了${skillName}` }
}

// ============================================================================
// 休息
// ============================================================================

export function rest(state: GameState): { success: boolean; message: string } {
  state.character.hp = state.character.maxHp
  state.character.mp = state.character.maxMp
  state.character.stamina = MAX_STAMINA
  state.character.poison = 0
  state.character.hurt = 0
  
  return { success: true, message: '休息完毕，状态全满' }
}

// ============================================================================
// 战斗
// ============================================================================

export function startBattle(state: GameState, enemyName: string): { success: boolean; message: string; enemies?: Array<{ name: string; hp: number; maxHp: number; attack: number; defence: number }> } {
  const enemyTemplates: Record<string, { hp: number; attack: number; defence: number }> = {
    '山贼': { hp: 80, attack: 15, defence: 10 },
    '强盗': { hp: 120, attack: 25, defence: 15 },
    '老虎': { hp: 150, attack: 35, defence: 20 },
    '毒蛇': { hp: 60, attack: 10, defence: 5 },
    '武林高手': { hp: 200, attack: 40, defence: 30 },
  }
  
  const template = enemyTemplates[enemyName]
  if (!template) {
    return { success: false, message: `没有遇到${enemyName}` }
  }
  
  const count = enemyName === '老虎' || enemyName === '毒蛇' ? 1 : Math.floor(Math.random() * 3) + 1
  const enemies = Array.from({ length: count }, (_, i) => ({
    name: `${enemyName}${i + 1}`,
    hp: template.hp,
    maxHp: template.hp,
    attack: template.attack,
    defence: template.defence,
  }))
  
  return { success: true, message: `⚔️ 遭遇${count}个${enemyName}！`, enemies }
}

export function attackEnemy(
  state: GameState,
  enemies: Array<{ name: string; hp: number; maxHp: number; attack: number; defence: number }>,
  targetIndex: number
): { message: string; enemyDefeated: boolean; playerDamage: number } {
  const target = enemies[targetIndex]
  if (!target || target.hp <= 0) {
    return { message: '目标无效', enemyDefeated: false, playerDamage: 0 }
  }
  
  const damage = _calcDamage(
    state.character.attributes.attack,
    0,
    target.defence,
    state.character.attributes.ambidextrous,
    state.character.attributes.martialKnowledge
  )
  
  target.hp = Math.max(0, target.hp - damage)
  state.character.stamina = Math.max(0, state.character.stamina - 3)
  
  const defeated = target.hp <= 0
  if (defeated) {
    const exp = 10 + target.maxHp / 10
    state.character.exp += exp
    checkLevelUp(state)
  }
  
  return {
    message: `攻击${target.name}，造成${damage}点伤害${defeated ? '，击败！' : ''}`,
    enemyDefeated: defeated,
    playerDamage: 0,
  }
}

export function useSkillInBattle(
  state: GameState,
  enemies: Array<{ name: string; hp: number; maxHp: number; attack: number; defence: number }>,
  skillName: string,
  targetIndex: number
): { success: boolean; message: string } {
  const skill = state.character.skills.find(s => s === skillName)
  if (!skill) return { success: false, message: `没有学会${skillName}` }
  
  const target = enemies[targetIndex]
  if (!target || target.hp <= 0) {
    return { success: false, message: '目标无效' }
  }
  
  // 简化的技能伤害计算
  const baseDamage = 20 + state.character.level * 5
  const damage = _calcDamage(
    state.character.attributes.attack,
    baseDamage,
    target.defence,
    state.character.attributes.ambidextrous,
    state.character.attributes.martialKnowledge
  )
  
  target.hp = Math.max(0, target.hp - damage)
  state.character.mp = Math.max(0, state.character.mp - 10)
  state.character.stamina = Math.max(0, state.character.stamina - 3)
  
  const defeated = target.hp <= 0
  if (defeated) {
    const exp = 10 + target.maxHp / 10
    state.character.exp += exp
    checkLevelUp(state)
  }
  
  return {
    success: true,
    message: `使用${skillName}攻击${target.name}，造成${damage}点伤害${defeated ? '，击败！' : ''}`,
  }
}

export function enemyAttack(
  state: GameState,
  enemies: Array<{ name: string; hp: number; maxHp: number; attack: number; defence: number }>
): { message: string; playerDefeated: boolean } {
  const aliveEnemies = enemies.filter(e => e.hp > 0)
  if (aliveEnemies.length === 0) return { message: '', playerDefeated: false }
  
  const enemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
  const damage = Math.max(1, enemy.attack - state.character.attributes.defence)
  
  state.character.hp = Math.max(0, state.character.hp - damage)
  
  const defeated = state.character.hp <= 0
  return {
    message: `${enemy.name}攻击你，造成${damage}点伤害`,
    playerDefeated: defeated,
  }
}

// ============================================================================
// 升级
// ============================================================================

function checkLevelUp(state: GameState): void {
  const c = state.character
  const needed = getExpForLevel(c.level + 1)
  
  while (c.exp >= needed && c.level < 100) {
    c.level++
    c.exp -= needed
    
    const iq = c.attributes.iq
    const attrGain = Math.floor(Math.random() * (Math.floor((iq - 10) / 20) + 2)) + 1
    
    c.maxHp += (c.attributes.hpInc + Math.floor(Math.random() * 4)) * 3
    c.maxMp += (9 - attrGain) * 4
    c.attributes.attack += attrGain
    c.attributes.agility += attrGain
    c.attributes.defence += attrGain
    
    c.hp = c.maxHp
    c.mp = c.maxMp
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function healHp(state: GameState, amount: number): void {
  state.character.hp = Math.min(state.character.maxHp, state.character.hp + amount)
}

function healMp(state: GameState, amount: number): void {
  state.character.mp = Math.min(state.character.maxMp, state.character.mp + amount)
}

function healStamina(state: GameState, amount: number): void {
  state.character.stamina = Math.min(MAX_STAMINA, state.character.stamina + amount)
}

function dePoison(state: GameState, amount: number): void {
  state.character.poison = Math.max(0, state.character.poison - amount)
}

export function isDead(state: GameState): boolean {
  return state.character.hp <= 0
}
