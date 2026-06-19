/**
 * 金庸群侠传 · 游戏引擎
 *
 * 智能体唯一入口：所有游戏操作通过本文件导出函数执行。
 */

import {
  calculateDamage as calcDamage,
  getExpForLevel,
  calculateMpCost,
  calculateStaminaCost,
  calculatePoisonDamage,
  calculateHurtDamage,
  calculateMoveStaminaCost,
  DEFAULT_ATTRIBUTES,
  MAX_STAMINA,
  MAX_LEVEL,
  MAX_SKILL_LEVEL,
  MAX_INVENTORY_SIZE,
} from './game-logic';
import {
  initConfigs,
  getTemplates,
  getMap,
  getItem,
  getSkill,
  getSkillById,
  getSkillAttackAtLevel,
  getDialog,
  getEnemyTemplate,
  getNpcCard,
  getLocationMeta,
  isWeapon,
  isArmor,
  isConsumable,
  isSkillBook,
  mapDamageTypeToStaminaCost,
} from './config-loader';
import type {
  GameState,
  BattleEnemy,
  Character,
  TalkResult,
  LocationDetail,
  ActionOption,
  ResolveOptionResult,
  NpcCard,
  NpcContext,
  DialogChoice,
  EventResult,
  PlayerChoicePrompt,
  McpElicitationParams,
  FeishuInteractiveCard,
} from './game-types';
import {
  runTriggeredEvents,
  getInteractEventsForMap,
  getInteractEventLabel,
  getMapDangerHint,
  processDialogChoiceActions,
  evaluateConditions,
} from './event-engine';
import {
  loadGameState as persistenceLoadGameState,
  saveGameState,
  deleteSave,
  loadOrCreateGame as persistenceLoadOrCreateGame,
  loadOrCreateGameForUser as persistenceLoadOrCreateGameForUser,
  getSavePath,
  setSaveUserId,
  getSaveUserId,
} from './persistence';
import type { LoadGameResult } from './persistence';
import {
  buildChoicePrompt as buildChoicePromptFromOptions,
  toMcpElicitationParams,
  fromElicitationResponse,
  toFeishuInteractiveCard,
  feishuCardToMessageContent,
  parseFeishuButtonValue,
  parseDialogChoiceValue,
  parsePaginationValue,
  isPaginationValue,
  type BuildChoicePromptContext,
} from './choice-prompt';

export type {
  GameState,
  BattleEnemy,
  Character,
  LoadGameResult,
  TalkResult,
  LocationDetail,
  ActionOption,
  ResolveOptionResult,
  NpcCard,
  NpcContext,
  DialogChoice,
  EventResult,
  PlayerChoicePrompt,
  McpElicitationParams,
  FeishuInteractiveCard,
};
export {
  saveGameState,
  deleteSave,
  getSavePath,
  setSaveUserId,
  getSaveUserId,
  toMcpElicitationParams,
  fromElicitationResponse,
  toFeishuInteractiveCard,
  feishuCardToMessageContent,
  parseFeishuButtonValue,
};
export type { BuildChoicePromptContext };

initConfigs();

function autoSave(state: GameState): void {
  saveGameState(state);
}

function assertAlive(state: GameState): { ok: true } | { ok: false; message: string } {
  if (state.character.hp <= 0) {
    return { ok: false, message: '你已昏迷，无法行动' };
  }
  return { ok: true };
}

function clearBuffs(state: GameState): void {
  state.character.buffs = {};
}

function ensureSkillExp(state: GameState): void {
  if (!state.character.skillExp) {
    state.character.skillExp = {};
  }
}

/** @internal 供单元测试覆盖防御性分支 */
export function consumeItemStack(state: GameState, itemName: string): void {
  const inv = state.inventory.items.find((i) => i.name === itemName);
  if (!inv) return;
  inv.count--;
  if (inv.count <= 0) {
    state.inventory.items = state.inventory.items.filter((i) => i.name !== itemName);
  }
}

function resolveEnemyTemplateName(enemyDisplayName: string): string {
  const templates = getTemplates().enemies;
  if (templates[enemyDisplayName]) return enemyDisplayName;
  for (const key of Object.keys(templates)) {
    if (enemyDisplayName.startsWith(key)) return key;
  }
  return enemyDisplayName;
}

// ============================================================================
// 初始化
// ============================================================================

function buildCharacter(name: string): Character {
  const tpl = getTemplates();
  const attrs = { ...DEFAULT_ATTRIBUTES };
  const defaultSkills = tpl.defaultCharacter.skills ?? ['基本拳法'];
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
    skills: [...defaultSkills],
    skillLevels: Object.fromEntries(defaultSkills.map((s) => [s, 0])),
    skillExp: Object.fromEntries(defaultSkills.map((s) => [s, 0])),
    buffs: {},
  };
}

export function createNewGame(name: string): GameState {
  const tpl = getTemplates();
  const state: GameState = {
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
  runTriggeredEvents(state, 'auto', { mapName: state.location });
  saveGameState(state);
  return state;
}

export function loadGameState(): GameState | null {
  return persistenceLoadGameState();
}

export function loadOrCreateGame(
  createNewGameFn: (name: string) => GameState,
  name = '主角',
): LoadGameResult {
  return persistenceLoadOrCreateGame(createNewGameFn, name);
}

export function restartGame(name = '主角'): GameState {
  deleteSave();
  const state = createNewGame(name);
  saveGameState(state);
  return state;
}

// ============================================================================
// 状态查询
// ============================================================================

export function getStatus(state: GameState): string {
  const c = state.character;
  const expLine =
    c.level >= MAX_LEVEL
      ? `经验: ${c.exp}（已满级）`
      : `经验: ${c.exp}/${getExpForLevel(c.level + 1)}`;
  return [
    `👤 ${c.name} | Lv.${c.level} | ${expLine}`,
    `❤️ ${c.hp}/${c.maxHp} | 💠 ${c.mp}/${c.maxMp} | ⚡ ${c.stamina}/${MAX_STAMINA}`,
    c.poison > 0 ? `🧪 中毒: ${c.poison}` : null,
    c.hurt > 0 ? `💊 受伤: ${c.hurt}` : null,
    (c.buffs?.attack ?? 0) > 0 ? `⚔️ 攻加成: +${c.buffs!.attack}` : null,
    (c.buffs?.agility ?? 0) > 0 ? `💨 轻功加成: +${c.buffs!.agility}` : null,
    `💰 ${state.inventory.silver} | 📍 ${state.location} | 📅 第${state.week}周`,
  ]
    .filter(Boolean)
    .join('\n');
}

function personaToString(persona: NpcCard['persona']): string {
  if (typeof persona === 'string') return persona;
  const parts = [persona.archetype, persona.tone].filter(Boolean);
  return parts.join('，') || '';
}

function buildNpcCard(location: string, npcName: string): NpcCard | undefined {
  return getNpcCard(location, npcName);
}

function dialogToChoices(dialogId: string): DialogChoice[] {
  const dialog = getDialog(dialogId);
  if (!dialog?.choices?.length) return [];
  return dialog.choices.map((c, index) => ({
    text: c.text,
    nextId: c.nextId,
    index,
  }));
}

export function getLocationDetail(state: GameState): LocationDetail {
  const map = getMap(state.location);
  const meta = getLocationMeta(state.location);
  if (!map) {
    return {
      name: state.location,
      description: meta.description,
      atmosphere: meta.atmosphere,
      dangerLevel: meta.dangerLevel,
      connections: [],
      npcs: [],
      shops: [],
    };
  }

  return {
    name: state.location,
    description: meta.description,
    atmosphere: meta.atmosphere,
    dangerLevel: meta.dangerLevel,
    connections: [...map.connections],
    npcs: map.npcs.map((name) => {
      const card = getNpcCard(state.location, name);
      return { name, persona: card ? personaToString(card.persona) : undefined };
    }),
    shops: [...map.shops],
  };
}

export function getLocationInfo(state: GameState): string {
  const map = getMap(state.location);
  if (!map) return '当前位置未知';

  const detail = getLocationDetail(state);
  const lines = [`📍 ${state.location}`];
  if (detail.description) {
    lines.push(detail.description);
  }
  if (map.connections.length > 0) {
    lines.push(`可前往: ${map.connections.join('、')}`);
  }
  if (map.npcs.length > 0) {
    lines.push(`人物: ${map.npcs.join('、')}`);
  }
  if (map.shops.length > 0) {
    lines.push(`可购: ${map.shops.join('、')}`);
  }
  const dangerHint = getMapDangerHint(state.location);
  if (dangerHint) {
    lines.push(dangerHint);
  }
  return lines.join('\n');
}

export function getOptions(state: GameState): ActionOption[] {
  const alive = assertAlive(state);
  if (!alive.ok) {
    return [{ id: 'status', label: '查看状态', category: 'status' }];
  }

  const map = getMap(state.location);
  if (!map) {
    return [{ id: 'status', label: '查看状态', category: 'status' }];
  }

  const options: ActionOption[] = [];

  for (const npc of map.npcs) {
    options.push({
      id: `talk_${npc}`,
      label: `和${npc}交谈`,
      category: 'talk',
    });
  }

  for (const conn of map.connections) {
    options.push({
      id: `move_${conn}`,
      label: `前往${conn}`,
      category: 'move',
    });
  }

  for (const itemName of map.shops) {
    const itemCfg = getItem(itemName);
    const canAfford = state.inventory.silver >= (itemCfg?.price ?? Infinity);
    options.push({
      id: `buy_${itemName}`,
      label: `购买${itemName}`,
      category: 'shop',
      hint: canAfford ? undefined : `（需${itemCfg?.price}两，现有${state.inventory.silver}两）`,
    });
  }

  for (const event of getInteractEventsForMap(state.location)) {
    if (evaluateConditions(state, event.conditions)) {
      options.push({
        id: `interact_${event.id}`,
        label: getInteractEventLabel(event),
        category: 'interact',
      });
    }
  }

  options.push(
    { id: 'explore', label: '四处看看', category: 'explore' },
    { id: 'rest', label: '休息恢复', category: 'rest' },
    { id: 'status', label: '查看状态', category: 'status' },
  );

  return options;
}

export function resolveOption(state: GameState, optionId: string): ResolveOptionResult {
  if (isPaginationValue(optionId)) {
    const page = parsePaginationValue(optionId);
    if (page != null) {
      return {
        action: 'paginate',
        result: buildChoicePrompt(state, { page }),
      };
    }
  }

  const dialogRef = parseDialogChoiceValue(optionId);
  if (dialogRef) {
    return {
      action: 'dialog',
      result: chooseDialog(state, dialogRef.dialogId, dialogRef.index),
    };
  }

  if (optionId.startsWith('talk_')) {
    const npcName = optionId.slice('talk_'.length);
    return { action: 'talk', result: talkTo(state, npcName) };
  }
  if (optionId.startsWith('move_')) {
    const dest = optionId.slice('move_'.length);
    return { action: 'move', result: moveTo(state, dest) };
  }
  if (optionId.startsWith('buy_')) {
    const itemName = optionId.slice('buy_'.length);
    return { action: 'buy', result: buyItem(state, itemName) };
  }
  if (optionId.startsWith('interact_')) {
    const eventId = optionId.slice('interact_'.length);
    const events = runTriggeredEvents(state, 'interact', { mapName: state.location, eventId });
    autoSave(state);
    const message = events
      .map((e) => e.message)
      .filter(Boolean)
      .join('\n');
    const battle = events.find((e) => e.type === 'battle');
    return {
      action: 'interact',
      result: {
        success: true,
        message: message || '你探索了一番。',
        events,
        encounter: battle?.enemyName,
      },
    };
  }
  if (optionId === 'explore') {
    return {
      action: 'explore',
      result: { success: true, message: getLocationInfo(state) },
    };
  }
  if (optionId === 'rest') {
    return { action: 'rest', result: rest(state) };
  }
  if (optionId === 'status') {
    return { action: 'status', result: getStatus(state) };
  }
  return { action: 'unknown', result: { success: false, message: `未知选项：${optionId}` } };
}

export function buildChoicePrompt(
  state: GameState,
  ctx: BuildChoicePromptContext = {},
): PlayerChoicePrompt {
  return buildChoicePromptFromOptions(getOptions(state), ctx);
}

export function buildChoicePromptFromTalk(
  state: GameState,
  talkResult: TalkResult,
  message?: string,
): PlayerChoicePrompt {
  if (talkResult.choices?.length && talkResult.dialogId) {
    return buildChoicePromptFromOptions(getOptions(state), {
      message: message ?? talkResult.message,
      dialogChoices: talkResult.choices,
      dialogId: talkResult.dialogId,
    });
  }
  return buildChoicePrompt(state, { message: message ?? talkResult.message });
}

export function loadOrCreateGameForUser(userId: string, name = '主角'): LoadGameResult {
  return persistenceLoadOrCreateGameForUser(userId, createNewGame, name);
}

export function getNpcContext(state: GameState, npcName: string): NpcContext | null {
  const map = getMap(state.location);
  if (!map || !map.npcs.includes(npcName)) return null;

  const card = buildNpcCard(state.location, npcName);
  if (!card) return null;

  const char = state.character;
  const availableActions: NpcContext['availableActions'] = ['talk'];
  const constraints: string[] = [
    `你是${card.name}${card.title ? `（${card.title}）` : ''}，必须保持角色性格一致。`,
    '不可编造引擎未确认的物品给予、武功传授或任务完成。',
  ];

  if (typeof card.persona === 'object') {
    if (card.persona.tone) constraints.push(`说话风格：${card.persona.tone}`);
    if (card.persona.dislikes?.length) {
      constraints.push(`厌恶：${card.persona.dislikes.join('、')}`);
    }
  } else {
    constraints.push(`性格：${card.persona}`);
  }

  if (card.canTeach?.length) {
    for (const skill of card.canTeach) {
      const cond = card.conditions?.teach;
      const levelOk = !cond?.minLevel || char.level >= cond.minLevel;
      const iqOk = !cond?.minIQ || char.attributes.iq >= cond.minIQ;
      if (levelOk && iqOk && !char.skills.includes(skill)) {
        availableActions.push('teach');
        constraints.push(`可传授${skill}（需调用 learnSkill 落实，不可口头编造）。`);
      } else if (!levelOk || !iqOk) {
        constraints.push(
          `传授${skill}需等级${cond?.minLevel ?? 1}${cond?.minIQ ? `、资质${cond.minIQ}` : ''}，当前未达标，不得声称已传授。`,
        );
      }
    }
  }

  if (card.canGive?.length) {
    availableActions.push('give');
    constraints.push(`可给予物品：${card.canGive.join('、')}（须引擎确认）。`);
  }

  if (card.canHelp?.length || card.knowledge.length > 0) {
    availableActions.push('quest');
  }

  return {
    card,
    playerRelation: {
      level: char.level,
      iq: char.attributes.iq,
      flags: { ...state.flags },
      inventory: state.inventory.items.map((i) => i.name),
    },
    availableActions: [...new Set(availableActions)],
    constraints,
  };
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
  ensureSkillExp(state);
  return `🥋 武功:\n${skills
    .map((s) => {
      const lv = (state.character.skillLevels[s] ?? 0) + 1;
      const exp = state.character.skillExp![s] ?? 0;
      return `- ${s} Lv.${lv}（熟练 ${exp}/100）`;
    })
    .join('\n')}`;
}

// ============================================================================
// 移动
// ============================================================================

export function moveTo(
  state: GameState,
  destination: string,
): {
  success: boolean;
  message: string;
  encounter?: string;
  events?: EventResult[];
  locationDetail?: LocationDetail;
} {
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

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

  const moveCost = calculateMoveStaminaCost(getEffectiveAgility(state));
  if (state.character.stamina < moveCost) {
    return { success: false, message: `体力不足，需要${moveCost}点体力才能前往${destination}` };
  }

  state.location = destination;
  state.character.stamina = Math.max(0, state.character.stamina - moveCost);
  state.week++;
  clearBuffs(state);
  advanceWeekEffects(state);

  if (!state.visitedMaps.includes(destination)) {
    state.visitedMaps.push(destination);
  }

  const destMap = getMap(destination);
  let encounter: string | undefined;
  if (
    destMap?.encounterRate &&
    destMap.encounterRate > 0 &&
    destMap.encounterEnemies &&
    destMap.encounterEnemies.length > 0 &&
    Math.random() * 100 < destMap.encounterRate
  ) {
    const pool = destMap.encounterEnemies;
    encounter = pool[Math.floor(Math.random() * pool.length)];
  }

  const events = runTriggeredEvents(state, 'auto', { mapName: destination });
  const locationDetail = getLocationDetail(state);

  autoSave(state);

  const meta = getLocationMeta(destination);
  let message = meta.description
    ? `你来到了${destination}。${meta.description}`
    : `你来到了${destination}`;
  const eventMessages = events.map((e) => e.message).filter(Boolean);
  if (eventMessages.length > 0) {
    message += `\n${eventMessages.join('\n')}`;
  }
  if (encounter) {
    message += `。暗处传来脚步声——似乎有${encounter}埋伏！`;
  }
  return { success: true, message, encounter, events, locationDetail };
}

// ============================================================================
// NPC 交互
// ============================================================================

export function talkTo(state: GameState, npcName: string): TalkResult {
  const map = getMap(state.location);
  if (!map) return { success: false, message: '当前位置未知' };

  if (npcName === 'random') {
    if (map.npcs.length === 0) return { success: false, message: '这里没有人' };
    npcName = map.npcs[Math.floor(Math.random() * map.npcs.length)];
  }

  if (!map.npcs.includes(npcName)) {
    return { success: false, message: `${state.location}没有${npcName}` };
  }

  const npc = buildNpcCard(state.location, npcName);
  const context = getNpcContext(state, npcName) ?? undefined;

  const talkEvents = runTriggeredEvents(state, 'talk', {
    mapName: state.location,
    npcName,
  });

  const dialogId = map.npcDialogs[npcName];
  if (dialogId) {
    const dialog = getDialog(dialogId);
    if (dialog) {
      autoSave(state);
      return {
        success: true,
        message: `${dialog.speaker}：「${dialog.text}」`,
        npc,
        context,
        dialogId,
        choices: dialogToChoices(dialogId),
        events: talkEvents.length > 0 ? talkEvents : undefined,
      };
    }
  }

  return {
    success: true,
    message: `你和${npcName}聊了起来`,
    npc,
    context,
    events: talkEvents.length > 0 ? talkEvents : undefined,
  };
}

export function chooseDialog(state: GameState, dialogId: string, choiceIndex: number): TalkResult {
  const dialog = getDialog(dialogId);
  if (!dialog) {
    return { success: false, message: '对话不存在' };
  }

  const choice = dialog.choices?.[choiceIndex];
  if (!choice) {
    return { success: false, message: '无效的选项' };
  }

  const actionResults: EventResult[] = [];
  if (choice.actions?.length) {
    actionResults.push(...processDialogChoiceActions(state, choice.actions));
  }

  if (choice.nextId) {
    const nextDialog = getDialog(choice.nextId);
    if (nextDialog) {
      autoSave(state);
      return {
        success: true,
        message: `${nextDialog.speaker}：「${nextDialog.text}」`,
        dialogId: choice.nextId,
        choices: dialogToChoices(choice.nextId),
        events: actionResults.length > 0 ? actionResults : undefined,
      };
    }
  }

  autoSave(state);
  const actionMsg = actionResults
    .map((r) => r.message)
    .filter(Boolean)
    .join('\n');
  return {
    success: true,
    message: actionMsg || '你结束了对话。',
    events: actionResults.length > 0 ? actionResults : undefined,
  };
}

// ============================================================================
// 商店
// ============================================================================

export function buyItem(state: GameState, itemName: string): { success: boolean; message: string } {
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

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

  const totalItems = state.inventory.items.reduce((sum, i) => sum + i.count, 0);
  const existing = state.inventory.items.find((i) => i.name === itemName);
  if (!existing && totalItems >= MAX_INVENTORY_SIZE) {
    return { success: false, message: `背包已满（最多${MAX_INVENTORY_SIZE}种物品）` };
  }

  state.inventory.silver -= item.price;
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
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

  const inv = state.inventory.items.find((i) => i.name === itemName);
  if (!inv || inv.count <= 0) {
    return { success: false, message: `没有${itemName}` };
  }

  const item = getItem(itemName);
  if (!item || !isConsumable(item)) {
    return { success: false, message: `${itemName}无法使用` };
  }

  // 武功秘籍
  if (isSkillBook(item)) {
    const skill = getSkillById(item.skillId!);
    if (!skill) return { success: false, message: `${itemName}内容残缺，无法修习` };

    const c = state.character;
    if ((item.needIQ ?? 0) > c.attributes.iq) {
      return { success: false, message: `资质不足，需要${item.needIQ}点资质才能研读${itemName}` };
    }
    if ((item.needExp ?? 0) > c.exp) {
      return { success: false, message: `经验不足，需要${item.needExp}点经验才能研读${itemName}` };
    }
    if (c.skills.includes(skill.name)) {
      return { success: false, message: `已经学会了${skill.name}` };
    }

    c.skills.push(skill.name);
    c.skillLevels[skill.name] = 0;
    ensureSkillExp(state);
    state.character.skillExp![skill.name] = 0;
    consumeItemStack(state, itemName);
    autoSave(state);
    return { success: true, message: `研读${itemName}，学会了${skill.name}` };
  }

  const c = state.character;
  if (!c.buffs) c.buffs = {};
  const parts: string[] = [];
  let hpGain = 0;
  let mpGain = 0;
  let staminaGain = 0;
  let poisonReduced = 0;
  let buffAttack = 0;
  let buffAgility = 0;

  if (item.useAddHp > 0) {
    hpGain = Math.min(item.useAddHp, c.maxHp - c.hp);
    if (hpGain > 0) parts.push(`恢复${hpGain}生命`);
  }
  if (item.useAddMp > 0) {
    mpGain = Math.min(item.useAddMp, c.maxMp - c.mp);
    if (mpGain > 0) parts.push(`恢复${mpGain}内力`);
  }
  if (item.useAddStamina > 0) {
    staminaGain = Math.min(item.useAddStamina, MAX_STAMINA - c.stamina);
    if (staminaGain > 0) parts.push(`恢复${staminaGain}体力`);
  }
  if (item.useDePoison > 0 && c.poison > 0) {
    poisonReduced = Math.min(item.useDePoison, c.poison);
    parts.push('解除中毒');
  }
  if ((item.useAddAttack ?? 0) > 0) {
    if ((c.buffs.attack ?? 0) > 0) {
      return { success: false, message: `${itemName}效果仍在，无需重复使用` };
    }
    buffAttack = item.useAddAttack!;
    parts.push(`攻击力临时+${buffAttack}`);
  }
  if ((item.useAddAgility ?? 0) > 0) {
    if ((c.buffs.agility ?? 0) > 0) {
      return { success: false, message: `${itemName}效果仍在，无需重复使用` };
    }
    buffAgility = item.useAddAgility!;
    parts.push(`轻功临时+${buffAgility}`);
  }

  const totalGain = hpGain + mpGain + staminaGain + poisonReduced + buffAttack + buffAgility;
  if (totalGain === 0) {
    if (item.useDePoison > 0 && c.poison <= 0) {
      return { success: false, message: '你没有中毒，无需使用解毒丸' };
    }
    return { success: false, message: `${itemName}当前无需使用` };
  }

  c.hp += hpGain;
  c.mp += mpGain;
  c.stamina += staminaGain;
  c.poison -= poisonReduced;
  if (buffAttack > 0) c.buffs.attack = buffAttack;
  if (buffAgility > 0) c.buffs.agility = buffAgility;

  consumeItemStack(state, itemName);
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
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

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
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

  if (!getSkill(skillName)) {
    return { success: false, message: `江湖上没有${skillName}这门武功` };
  }
  if (state.character.skills.includes(skillName)) {
    return { success: false, message: `已经学会了${skillName}` };
  }

  state.character.skills.push(skillName);
  state.character.skillLevels[skillName] = 0;
  ensureSkillExp(state);
  state.character.skillExp![skillName] = 0;
  autoSave(state);
  return { success: true, message: `学会了${skillName}` };
}

// ============================================================================
// 休息
// ============================================================================

export function rest(state: GameState): { success: boolean; message: string } {
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

  state.character.hp = state.character.maxHp;
  state.character.mp = state.character.maxMp;
  state.character.stamina = MAX_STAMINA;
  state.character.poison = 0;
  state.character.hurt = 0;
  clearBuffs(state);

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
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

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
  const alive = assertAlive(state);
  if (!alive.ok) return { message: alive.message, enemyDefeated: false, playerDamage: 0 };

  const target = enemies[targetIndex];
  if (!target || target.hp <= 0) {
    return { message: '目标无效', enemyDefeated: false, playerDamage: 0 };
  }

  const staminaCost = calculateStaminaCost('normal');
  if (state.character.stamina < staminaCost) {
    return { message: '体力不足，无法攻击', enemyDefeated: false, playerDamage: 0 };
  }

  const damage = calcDamage(
    getEffectiveAttack(state),
    0,
    target.defence,
    state.character.attributes.ambidextrous,
    state.character.attributes.martialKnowledge,
  );

  target.hp = Math.max(0, target.hp - damage);
  state.character.stamina = Math.max(0, state.character.stamina - staminaCost);

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
  const alive = assertAlive(state);
  if (!alive.ok) return { success: false, message: alive.message };

  if (!state.character.skills.includes(skillName)) {
    return { success: false, message: `没有学会${skillName}` };
  }

  const skill = getSkill(skillName);
  if (!skill) return { success: false, message: `未知武功${skillName}` };

  const levelIndex = state.character.skillLevels[skillName] ?? 0;
  const mpCost = calculateMpCost(skill.mpCost, levelIndex);
  if (state.character.mp < mpCost) {
    return { success: false, message: `内力不足，需要${mpCost}点内力` };
  }

  const staminaCost = calculateStaminaCost(mapDamageTypeToStaminaCost(skill.damageType));
  if (state.character.stamina < staminaCost) {
    return { success: false, message: `体力不足，无法施展${skillName}` };
  }

  state.character.mp = Math.max(0, state.character.mp - mpCost);
  state.character.stamina = Math.max(0, state.character.stamina - staminaCost);

  // 自身目标类武功
  if (skill.damageType === 3) {
    const reduced = Math.min(state.character.poison, 50);
    state.character.poison = Math.max(0, state.character.poison - reduced);
    grantSkillExp(state, skillName);
    autoSave(state);
    return {
      success: true,
      message: reduced > 0 ? `使用${skillName}，解除了部分毒素` : `使用${skillName}，你并未中毒`,
    };
  }

  if (skill.damageType === 4) {
    const skillAttack = getSkillAttackAtLevel(skillName, levelIndex);
    const healAmount = Math.min(skillAttack, state.character.maxHp - state.character.hp);
    state.character.hp += healAmount;
    grantSkillExp(state, skillName);
    autoSave(state);
    return {
      success: true,
      message:
        healAmount > 0
          ? `使用${skillName}，恢复${healAmount}点生命`
          : `使用${skillName}，气血已足，无需治疗`,
    };
  }

  const target = enemies[targetIndex];
  if (!target || target.hp <= 0) {
    return { success: false, message: '目标无效' };
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

  let extra = '';
  if (skill.damageType === 1) {
    const absorbed = Math.min(Math.floor(damage / 2), state.character.maxMp - state.character.mp);
    state.character.mp += absorbed;
    if (absorbed > 0) extra = `，吸取${absorbed}点内力`;
  }
  if (skill.damageType === 2) {
    extra = '，敌人身中剧毒';
  }

  const defeated = target.hp <= 0;
  if (defeated) {
    grantBattleExp(state, target.maxHp);
  }
  grantSkillExp(state, skillName);

  autoSave(state);
  return {
    success: true,
    message: `使用${skillName}攻击${target.name}，造成${damage}点伤害${extra}${defeated ? '，击败！' : ''}`,
  };
}

export function enemyAttack(
  state: GameState,
  enemies: BattleEnemy[],
): { message: string; playerDefeated: boolean } {
  if (state.character.hp <= 0) {
    return { message: '', playerDefeated: true };
  }

  const aliveEnemies = enemies.filter((e) => e.hp > 0);
  if (aliveEnemies.length === 0) return { message: '', playerDefeated: false };

  const enemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
  const damage = Math.max(1, enemy.attack - getEffectiveDefence(state));

  state.character.hp = Math.max(0, state.character.hp - damage);

  const templateName = resolveEnemyTemplateName(enemy.name);
  const template = getEnemyTemplate(templateName);
  if (template?.onHitPoison) {
    state.character.poison += template.onHitPoison;
  }
  if (template?.onHitHurt) {
    state.character.hurt += template.onHitHurt;
  }

  let debuffMsg = '';
  if (template?.onHitPoison) debuffMsg += '，你感到一阵麻痹';
  if (template?.onHitHurt) debuffMsg += '，你受了内伤';

  autoSave(state);
  return {
    message: `${enemy.name}攻击你，造成${damage}点伤害${debuffMsg}`,
    playerDefeated: state.character.hp <= 0,
  };
}

// ============================================================================
// 状态辅助
// ============================================================================

export function advanceWeek(state: GameState): void {
  state.week++;
  clearBuffs(state);
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

function getEffectiveAgility(state: GameState): number {
  return state.character.attributes.agility + (state.character.buffs?.agility ?? 0);
}

function getEffectiveAttack(state: GameState): number {
  let attack = state.character.attributes.attack + (state.character.buffs?.attack ?? 0);
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
  state.character.exp += Math.floor(10 + enemyMaxHp / 10);
  checkLevelUp(state);
}

function grantSkillExp(state: GameState, skillName: string): void {
  ensureSkillExp(state);
  const levels = state.character.skillLevels;
  const levelIndex = levels[skillName] ?? 0;
  if (levelIndex >= MAX_SKILL_LEVEL - 1) return;

  const gain = Math.floor(Math.random() * 3) + 1;
  state.character.skillExp![skillName] = (state.character.skillExp![skillName] ?? 0) + gain;

  while (
    state.character.skillExp![skillName] >= 100 &&
    (levels[skillName] ?? 0) < MAX_SKILL_LEVEL - 1
  ) {
    state.character.skillExp![skillName] -= 100;
    levels[skillName] = (levels[skillName] ?? 0) + 1;
  }
}

function checkLevelUp(state: GameState): void {
  const c = state.character;
  let needed = getExpForLevel(c.level + 1);

  while (c.exp >= needed && c.level < MAX_LEVEL) {
    c.level++;
    c.exp -= needed;

    const iq = c.attributes.iq;
    const attrGain = Math.floor(Math.random() * (Math.floor((iq - 10) / 20) + 2)) + 1;

    c.maxHp += (c.attributes.hpInc + Math.floor(Math.random() * 4)) * 3;
    c.maxMp += Math.max(0, (9 - attrGain) * 4);
    c.attributes.attack += attrGain;
    c.attributes.agility += attrGain;
    c.attributes.defence += attrGain;

    c.attributes.level = c.level;
    c.attributes.exp = c.exp;
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    needed = getExpForLevel(c.level + 1);
  }
}
