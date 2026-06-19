/**
 * 游戏状态类型 — game-engine 与 persistence 共享
 */

import type { DEFAULT_ATTRIBUTES } from './game-logic';

export interface CharacterBuffs {
  attack?: number;
  agility?: number;
}

export interface Character {
  name: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  poison: number;
  hurt: number;
  attributes: typeof DEFAULT_ATTRIBUTES;
  equipment: { weapon: string | null; armor: string | null };
  skills: string[];
  skillLevels: Record<string, number>;
  skillExp?: Record<string, number>;
  buffs?: CharacterBuffs;
}

export interface Inventory {
  silver: number;
  items: Array<{ id: string; name: string; count: number }>;
}

export interface GameState {
  character: Character;
  team: string[];
  inventory: Inventory;
  location: string;
  week: number;
  flags: Record<string, boolean | number>;
  visitedMaps: string[];
  completedQuests: string[];
}

export interface BattleEnemy {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
}

export interface NpcPersonaDetail {
  archetype?: string;
  tone?: string;
  likes?: string[];
  dislikes?: string[];
}

export interface NpcTeachCondition {
  minLevel?: number;
  minIQ?: number;
  flag?: string;
}

export interface NpcCard {
  name: string;
  title?: string;
  persona: string | NpcPersonaDetail;
  knowledge: string[];
  canHelp?: string[];
  isShop?: boolean;
  canTeach?: string[];
  canGive?: string[];
  conditions?: {
    teach?: NpcTeachCondition;
    give?: NpcTeachCondition;
    quest?: NpcTeachCondition;
  };
}

export interface DialogChoice {
  text: string;
  nextId: string;
  index: number;
}

export interface EventResult {
  type: 'dialog' | 'setFlag' | 'addItem' | 'message' | 'battle' | 'heal';
  message?: string;
  dialogId?: string;
  choices?: DialogChoice[];
  flag?: string;
  itemName?: string;
  enemyName?: string;
}

export interface ActionOption {
  id: string;
  label: string;
  category: 'talk' | 'move' | 'shop' | 'explore' | 'rest' | 'status' | 'interact';
  hint?: string;
}

export interface TalkResult {
  success: boolean;
  message: string;
  npc?: NpcCard;
  choices?: DialogChoice[];
  events?: EventResult[];
  dialogId?: string;
  context?: NpcContext;
}

export interface LocationDetail {
  name: string;
  description: string;
  atmosphere: string;
  dangerLevel: 'safe' | 'cautious' | 'dangerous';
  connections: string[];
  npcs: Array<{ name: string; persona?: string }>;
  shops: string[];
}

export interface NpcContext {
  card: NpcCard;
  playerRelation: {
    level: number;
    iq: number;
    flags: Record<string, boolean | number>;
    inventory: string[];
  };
  availableActions: Array<'teach' | 'give' | 'quest' | 'talk'>;
  constraints: string[];
}

export interface ResolveOptionResult {
  action: string;
  result:
    | TalkResult
    | {
        success: boolean;
        message: string;
        encounter?: string;
        events?: EventResult[];
        locationDetail?: LocationDetail;
      }
    | { success: boolean; message: string }
    | string
    | { events: EventResult[] }
    | PlayerChoicePrompt;
}

export interface PlayerChoiceItem {
  value: string;
  label: string;
  description?: string;
  category?: ActionOption['category'] | 'nav';
}

export interface PlayerChoicePrompt {
  type: 'player_choice';
  message: string;
  choices: PlayerChoiceItem[];
  dialogChoices?: DialogChoice[];
  dialogId?: string;
  page?: number;
  hasMore?: boolean;
  totalPages?: number;
}

export interface McpElicitationParams {
  mode: 'form';
  message: string;
  requestedSchema: {
    type: 'object';
    properties: {
      action: {
        type: 'string';
        title: string;
        description?: string;
        oneOf: Array<{ const: string; title: string }>;
      };
    };
    required: ['action'];
  };
}

export interface FeishuInteractiveCard {
  config: { wide_screen_mode: boolean };
  header?: { title: { tag: 'plain_text'; content: string } };
  elements: Array<Record<string, unknown>>;
}
