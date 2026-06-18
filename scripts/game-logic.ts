/**
 * 金庸群侠传 · 游戏核心公式
 * 
 * 所有数值计算必须遵循此文件中的公式。
 */

// ============================================================================
// 战斗系统
// ============================================================================

/**
 * 计算战斗伤害
 * 公式: 武力 + 技能攻击力 - 敌方防御
 * 左右互搏: ×1.5
 * 武学常识加成: +武学常识/10
 * 随机波动: ±20%
 */
export function calculateDamage(
  attackerAttack: number,
  skillAttack: number,
  defenderDefence: number,
  ambidextrous: number = 0,
  martialKnowledge: number = 0
): number {
  let damage = attackerAttack + skillAttack - defenderDefence
  
  if (ambidextrous > 0) {
    damage = Math.floor(damage * 1.5)
  }
  
  if (martialKnowledge > 0) {
    damage += Math.floor(martialKnowledge / 10)
  }
  
  const randomFactor = 0.8 + Math.random() * 0.4
  damage = Math.floor(damage * randomFactor)
  
  return Math.max(1, damage)
}

/**
 * 计算中毒掉血
 * 公式: 中毒值 / 10
 */
export function calculatePoisonDamage(poison: number): number {
  return Math.floor(poison / 10)
}

/**
 * 计算受伤掉血
 * 公式: 受伤值 / 20
 */
export function calculateHurtDamage(hurt: number): number {
  return Math.floor(hurt / 20)
}

// ============================================================================
// 角色系统
// ============================================================================

/**
 * 计算升级所需经验
 * 公式: floor(100 × 1.5^(等级-1))
 */
export function getExpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1))
}

/**
 * 计算内力消耗
 * 公式: 基础消耗 × ((等级+1)/2)
 */
export function calculateMpCost(baseCost: number, skillLevel: number): number {
  return Math.floor(baseCost * ((skillLevel + 1) / 2))
}

/**
 * 计算体力消耗
 * 普通攻击: 3
 * 用毒: 2
 * 解毒: 2
 * 医疗: 4
 */
export function calculateStaminaCost(damageType: string): number {
  switch (damageType) {
    case 'normal':
    case 'absorbMp':
      return 3
    case 'poison':
    case 'depoison':
      return 2
    case 'heal':
      return 4
    default:
      return 3
  }
}

/**
 * 计算移动力
 * 公式: 轻功/15 + 3
 */
export function calculateMovePoints(agility: number): number {
  return Math.floor(agility / 15) + 3
}

// ============================================================================
// 默认属性
// ============================================================================

export const DEFAULT_ATTRIBUTES = {
  maxHp: 100,
  maxMp: 50,
  hp: 100,
  mp: 50,
  hpInc: 5,
  attack: 20,
  agility: 15,
  defence: 10,
  heal: 0,
  usePoison: 0,
  dePoison: 0,
  antiPoison: 0,
  fist: 0,
  sword: 0,
  blade: 0,
  exotic: 0,
  hiddenWeapon: 0,
  martialKnowledge: 0,
  attackPoison: 0,
  ambidextrous: 0,
  iq: 50,
  morality: 50,
  reputation: 0,
  stamina: 100,
  poison: 0,
  hurt: 0,
  mpType: 'neutral',
  level: 1,
  exp: 0,
}

// ============================================================================
// 常量
// ============================================================================

export const MAX_LEVEL = 100
export const MAX_SKILL_LEVEL = 10
export const MAX_STAMINA = 100
export const MAX_EXP = 9999999
export const MAX_TEAM_SIZE = 6
export const MAX_INVENTORY_SIZE = 100
