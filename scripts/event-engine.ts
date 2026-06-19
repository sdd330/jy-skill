/**
 * 事件引擎 — 处理 game-config.json 中的地图事件与对话动作
 */

import type { GameState, EventResult, DialogChoice } from './game-types';
import type { MapEvent, MapEventCondition, MapEventAction, DialogConfig } from './config-loader';
import { getDialog, getItemById, getMapEvents, getMap } from './config-loader';

export interface EventContext {
  mapName?: string;
  eventId?: string;
  npcName?: string;
}

export function evaluateConditions(state: GameState, conditions: MapEventCondition[]): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(state, c));
}

function evaluateCondition(state: GameState, condition: MapEventCondition): boolean {
  const params = condition.params;
  switch (condition.type) {
    case 'flag': {
      const flag = params.flag as string;
      const expected = params.value as boolean | number;
      const actual = state.flags[flag];
      if (expected === false) return actual === undefined || actual === false;
      return actual === expected;
    }
    case 'level': {
      const min = (params.min as number) ?? 0;
      return state.character.level >= min;
    }
    case 'item': {
      const itemId = params.itemId as number;
      const item = getItemById(itemId);
      if (!item) return false;
      const inv = state.inventory.items.find((i) => i.name === item.name);
      const minCount = (params.count as number) ?? 1;
      return (inv?.count ?? 0) >= minCount;
    }
    case 'quest': {
      const questId = params.questId as string;
      return state.completedQuests.includes(questId);
    }
    default:
      return true;
  }
}

export function checkEvents(
  state: GameState,
  trigger: 'auto' | 'interact' | 'talk',
  ctx: EventContext = {},
): MapEvent[] {
  const mapName = ctx.mapName ?? state.location;
  const events = getMapEvents(mapName);
  return events.filter((event) => {
    if (event.triggerType !== trigger) return false;
    if (ctx.eventId && event.id !== ctx.eventId) return false;
    if (trigger === 'talk' && ctx.npcName && event.npcName && event.npcName !== ctx.npcName) {
      return false;
    }
    return evaluateConditions(state, event.conditions);
  });
}

function dialogToChoices(dialog: DialogConfig): DialogChoice[] {
  if (!dialog.choices?.length) return [];
  return dialog.choices.map((c, index) => ({
    text: c.text,
    nextId: c.nextId,
    index,
  }));
}

function dialogToResult(dialog: DialogConfig): EventResult {
  return {
    type: 'dialog',
    message: `${dialog.speaker}：「${dialog.text}」`,
    dialogId: dialog.id,
    choices: dialogToChoices(dialog),
  };
}

export function processEventAction(state: GameState, action: MapEventAction): EventResult | null {
  const params = action.params;
  switch (action.type) {
    case 'setFlag': {
      const flag = params.flag as string;
      state.flags[flag] = params.value as boolean | number;
      return { type: 'setFlag', flag, message: '' };
    }
    case 'dialog': {
      const dialogId = params.dialogId as string;
      const dialog = getDialog(dialogId);
      if (!dialog) return { type: 'message', message: '（对话缺失）' };
      return dialogToResult(dialog);
    }
    case 'addItem': {
      const itemId = params.itemId as number;
      const count = (params.count as number) ?? 1;
      const item = getItemById(itemId);
      if (!item) return { type: 'message', message: '（物品缺失）' };
      const existing = state.inventory.items.find((i) => i.name === item.name);
      if (existing) {
        existing.count += count;
      } else {
        state.inventory.items.push({
          id: String(item.id),
          name: item.name,
          count,
        });
      }
      return { type: 'addItem', itemName: item.name, message: `获得了${item.name}×${count}` };
    }
    case 'battle': {
      const enemyName = (params.enemyName as string) ?? '山贼';
      return { type: 'battle', enemyName, message: `⚔️ 遭遇${enemyName}！` };
    }
    case 'heal': {
      state.character.hp = state.character.maxHp;
      state.character.mp = state.character.maxMp;
      state.character.stamina = 100;
      state.character.poison = 0;
      state.character.hurt = 0;
      return { type: 'heal', message: '休息完毕，状态全满' };
    }
    default:
      return null;
  }
}

export function processEvent(state: GameState, event: MapEvent): EventResult[] {
  const results: EventResult[] = [];
  for (const action of event.actions) {
    const result = processEventAction(state, action);
    if (result) {
      if (result.message) results.push(result);
      else if (result.type !== 'setFlag') results.push(result);
      else results.push(result);
    }
  }
  return results.filter((r) => r.message || r.type === 'dialog' || r.type === 'battle');
}

export function processDialogChoiceActions(
  state: GameState,
  actions: MapEventAction[],
): EventResult[] {
  const results: EventResult[] = [];
  for (const action of actions) {
    const result = processEventAction(state, action);
    if (result) results.push(result);
  }
  return results;
}

export function runTriggeredEvents(
  state: GameState,
  trigger: 'auto' | 'interact' | 'talk',
  ctx: EventContext = {},
): EventResult[] {
  const matched = checkEvents(state, trigger, ctx);
  const allResults: EventResult[] = [];
  for (const event of matched) {
    allResults.push(...processEvent(state, event));
  }
  return allResults;
}

export function formatEventResults(results: EventResult[]): string {
  return results
    .map((r) => r.message)
    .filter(Boolean)
    .join('\n');
}

export function getInteractEventLabel(event: MapEvent): string {
  for (const action of event.actions) {
    if (action.type === 'dialog') {
      const dialogId = action.params.dialogId as string;
      const dialog = getDialog(dialogId);
      if (dialog) return dialog.text.slice(0, 20);
    }
    if (action.type === 'addItem') return '探索此处';
  }
  return '探索';
}

export function getInteractEventsForMap(mapName: string): MapEvent[] {
  return getMapEvents(mapName).filter((e) => e.triggerType === 'interact');
}

export function hasInteractEvents(mapName: string): boolean {
  return getInteractEventsForMap(mapName).length > 0;
}

export function getMapDangerHint(mapName: string): string | undefined {
  const map = getMap(mapName);
  if (!map) return undefined;
  if (map.dangerLevel === 'dangerous') return '此地行路需当心，或有歹人埋伏';
  if (map.dangerLevel === 'cautious') return '此地不宜大意，多加留神';
  return undefined;
}
