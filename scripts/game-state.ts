/**
 * 金庸群侠传 · 游戏状态管理
 */

import { DEFAULT_ATTRIBUTES, MAX_STAMINA } from './game-logic'

// ============================================================================
// 游戏状态类型
// ============================================================================

export interface GameState {
  character: {
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
    equipment: {
      weapon: string | null
      armor: string | null
    }
    skills: string[]
  }
  team: string[]
  inventory: {
    silver: number
    items: Array<{ id: string; name: string; count: number }>
  }
  location: string
  week: number
  flags: Record<string, boolean | number>
  visitedMaps: string[]
  completedQuests: string[]
}

// ============================================================================
// 默认状态
// ============================================================================

export function createDefaultState(): GameState {
  return {
    character: {
      name: '主角',
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
      skills: [],
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
// 状态操作
// ============================================================================

export function healHp(state: GameState, amount: number): void {
  state.character.hp = Math.min(state.character.maxHp, state.character.hp + amount)
}

export function healMp(state: GameState, amount: number): void {
  state.character.mp = Math.min(state.character.maxMp, state.character.mp + amount)
}

export function healStamina(state: GameState, amount: number): void {
  state.character.stamina = Math.min(MAX_STAMINA, state.character.stamina + amount)
}

export function dePoison(state: GameState, amount: number): void {
  state.character.poison = Math.max(0, state.character.poison - amount)
}

export function addItem(state: GameState, id: string, name: string, count: number): void {
  const existing = state.inventory.items.find(item => item.id === id)
  if (existing) {
    existing.count += count
  } else {
    state.inventory.items.push({ id, name, count })
  }
}

export function removeItem(state: GameState, id: string, count: number): boolean {
  const existing = state.inventory.items.find(item => item.id === id)
  if (!existing || existing.count < count) return false

  existing.count -= count
  if (existing.count <= 0) {
    state.inventory.items = state.inventory.items.filter(item => item.id !== id)
  }
  return true
}

export function useItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = state.inventory.items.find(i => i.name === itemName)
  if (!item || item.count <= 0) {
    return { success: false, message: `没有${itemName}` }
  }

  if (itemName.includes('金创药') || itemName.includes('大还丹')) {
    const hpRestore = itemName.includes('大还丹') ? 150 : 50
    healHp(state, hpRestore)
    removeItem(state, item.id, 1)
    return { success: true, message: `使用${itemName}，恢复${hpRestore}生命` }
  }

  if (itemName.includes('小还丹')) {
    healMp(state, 50)
    removeItem(state, item.id, 1)
    return { success: true, message: `使用${itemName}，恢复50内力` }
  }

  if (itemName.includes('干粮')) {
    healStamina(state, 20)
    removeItem(state, item.id, 1)
    return { success: true, message: `使用${itemName}，恢复20体力` }
  }

  if (itemName.includes('解毒丸')) {
    dePoison(state, 50)
    removeItem(state, item.id, 1)
    return { success: true, message: `使用${itemName}，解除中毒` }
  }

  return { success: false, message: `${itemName}无法使用` }
}

export function equipItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const item = state.inventory.items.find(i => i.name === itemName)
  if (!item || item.count <= 0) {
    return { success: false, message: `没有${itemName}` }
  }

  const weaponNames = ['铁剑', '钢刀', '玄铁剑', '倚天剑', '屠龙刀']
  const armorNames = ['布衣', '皮甲', '金丝甲', '软猬甲']

  if (weaponNames.includes(itemName)) {
    state.character.equipment.weapon = itemName
    return { success: true, message: `装备${itemName}` }
  }

  if (armorNames.includes(itemName)) {
    state.character.equipment.armor = itemName
    return { success: true, message: `装备${itemName}` }
  }

  return { success: false, message: `${itemName}不可装备` }
}

export function learnSkill(state: GameState, skillName: string): { success: boolean; message: string } {
  if (state.character.skills.includes(skillName)) {
    return { success: false, message: `已经学会${skillName}` }
  }

  state.character.skills.push(skillName)
  return { success: true, message: `学会${skillName}` }
}

export function rest(state: GameState): void {
  state.character.hp = state.character.maxHp
  state.character.mp = state.character.maxMp
  state.character.stamina = MAX_STAMINA
  state.character.poison = 0
  state.character.hurt = 0
}

export function advanceWeek(state: GameState): void {
  state.week++
  
  if (state.character.poison > 0) {
    const poisonDamage = Math.floor(state.character.poison / 10)
    state.character.hp = Math.max(1, state.character.hp - poisonDamage)
  }
  
  if (state.character.hurt > 0) {
    const hurtDamage = Math.floor(state.character.hurt / 20)
    state.character.hp = Math.max(1, state.character.hp - hurtDamage)
  }
}

export function isDead(state: GameState): boolean {
  return state.character.hp <= 0
}
