/**
 * 配置加载器 — 从 assets/*.json 单源加载游戏数据
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = join(ROOT_DIR, 'assets');

// ============================================================================
// 类型
// ============================================================================

export interface MapInfo {
  npcs: string[];
  shops: string[];
  connections: string[];
  npcDialogs: Record<string, string>;
  encounterRate?: number;
  encounterEnemies?: string[];
}

export interface ItemConfig {
  id: number;
  name: string;
  desc: string;
  type: number;
  equipmentType: number;
  price: number;
  addAttack: number;
  addDefence: number;
  useAddHp: number;
  useAddMp: number;
  useAddStamina: number;
  useDePoison: number;
  useAddAttack?: number;
  useAddAgility?: number;
  useAddDefence?: number;
  useAddPoison?: number;
  skillId?: number;
  needIQ?: number;
  needExp?: number;
}

export interface SkillConfig {
  id: number;
  name: string;
  desc: string;
  mpCost: number;
  damageType: number;
  poison?: number;
  levels: number[][];
}

export interface CharacterConfig {
  id: number;
  name: string;
  maxHp: number;
  attack: number;
  defence: number;
  skills: number[][];
  source: string;
}

export interface DialogConfig {
  id: string;
  speaker: string;
  text: string;
}

export interface EnemyTemplate {
  hp: number;
  attack: number;
  defence: number;
  solo?: boolean;
  onHitPoison?: number;
  onHitHurt?: number;
}

export interface GameTemplates {
  defaultCharacter: {
    name: string;
    skills: string[];
  };
  defaultInventory: {
    silver: number;
    items: Array<{ id: string; name: string; count: number }>;
  };
  startLocation: string;
  enemies: Record<string, EnemyTemplate | { characterId: number }>;
  maps?: Record<
    string,
    {
      npcs: string[];
      shops: string[];
      connections: string[];
      encounters?: number | { rate: number; enemies: string[] };
    }
  >;
}

function parseEncounters(
  encounters?: number | { rate: number; enemies: string[] },
): Pick<MapInfo, 'encounterRate' | 'encounterEnemies'> {
  if (encounters == null) return {};
  if (typeof encounters === 'number') {
    return { encounterRate: encounters, encounterEnemies: ['山贼', '强盗'] };
  }
  return { encounterRate: encounters.rate, encounterEnemies: [...encounters.enemies] };
}

// ============================================================================
// 加载
// ============================================================================

function loadJson<T>(relativePath: string): T {
  const path = join(ASSETS_DIR, relativePath);
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

const mapsByName = new Map<string, MapInfo>();
const itemsByName = new Map<string, ItemConfig>();
const itemsById = new Map<number, ItemConfig>();
const skillsByName = new Map<string, SkillConfig>();
const skillsById = new Map<number, SkillConfig>();
const charactersById = new Map<number, CharacterConfig>();
const charactersByName = new Map<string, CharacterConfig>();
const dialogsById = new Map<string, DialogConfig>();
let templates: GameTemplates;
let initialized = false;

function resolveEnemyTemplate(
  entry: EnemyTemplate | { characterId: number },
): EnemyTemplate | undefined {
  if ('characterId' in entry) {
    const char = charactersById.get(entry.characterId);
    if (!char) return undefined;
    return { hp: char.maxHp, attack: char.attack, defence: char.defence };
  }
  return entry;
}

function buildMapsFromConfig(): void {
  const gameConfig = loadJson<{
    maps: Array<{
      id: number;
      name: string;
      npcs: Array<{
        roleId: number;
        dialogId: string;
        isShop: boolean;
        shopItems: number[];
      }>;
      connections: Array<{ targetMapId: number }>;
    }>;
    dialogs: Record<string, DialogConfig>;
  }>('game-config.json');

  const mapIdToName = new Map<number, string>();
  for (const map of gameConfig.maps) {
    mapIdToName.set(map.id, map.name);
  }

  for (const [id, dialog] of Object.entries(gameConfig.dialogs)) {
    dialogsById.set(id, dialog);
  }

  const templateMaps = templates.maps ?? {};

  for (const map of gameConfig.maps) {
    const templateMap = templateMaps[map.name as keyof typeof templateMaps];
    const npcDialogs: Record<string, string> = {};
    const npcNames: string[] = [];
    const shopNames = new Set<string>();

    for (const npc of map.npcs) {
      const char = charactersById.get(npc.roleId);
      if (!char) continue;
      npcNames.push(char.name);
      npcDialogs[char.name] = npc.dialogId;
      if (npc.isShop) {
        for (const itemId of npc.shopItems) {
          const item = itemsById.get(itemId);
          if (item) shopNames.add(item.name);
        }
      }
    }

    const connections =
      templateMap && 'connections' in templateMap
        ? [...templateMap.connections]
        : map.connections
            .map((c) => mapIdToName.get(c.targetMapId))
            .filter((name): name is string => Boolean(name));

    const shops =
      templateMap && templateMap.shops?.length > 0 ? [...templateMap.shops] : [...shopNames];

    const encounterConfig = parseEncounters(templateMap?.encounters);

    mapsByName.set(map.name, {
      npcs: templateMap?.npcs?.length ? [...templateMap.npcs] : npcNames,
      shops,
      connections,
      npcDialogs,
      ...encounterConfig,
    });
  }

  // templates 中有但 game-config 未列出的地图（兜底）
  for (const [name, map] of Object.entries(templateMaps)) {
    if (!mapsByName.has(name)) {
      const encounterConfig = parseEncounters(map.encounters);
      mapsByName.set(name, {
        npcs: [...map.npcs],
        shops: [...map.shops],
        connections: [...map.connections],
        npcDialogs: {},
        ...encounterConfig,
      });
    }
  }
}

function loadCharacters(): void {
  const index = loadJson<{ characters: Array<{ id: number; name: string }> }>(
    'characters/index.json',
  );

  for (const info of index.characters) {
    try {
      const data = loadJson<CharacterConfig>(`characters/${info.id}.json`);
      charactersById.set(data.id, data);
      charactersByName.set(data.name, data);
    } catch {
      // 跳过缺失文件，validate-assets 会报告
    }
  }
}

function loadItems(): void {
  const data = loadJson<{ items: ItemConfig[] }>('items.json');
  for (const item of data.items) {
    itemsByName.set(item.name, item);
    itemsById.set(item.id, item);
  }
}

function loadSkills(): void {
  const data = loadJson<{ skills: SkillConfig[] }>('skills.json');
  for (const skill of data.skills) {
    skillsByName.set(skill.name, skill);
    skillsById.set(skill.id, skill);
  }
}

/** 初始化配置（幂等） */
export function initConfigs(): void {
  if (initialized) return;

  templates = loadJson<GameTemplates>('templates.json');
  if (!templates.startLocation) {
    templates.startLocation = '小村';
  }
  if (!templates.enemies) {
    templates.enemies = {
      山贼: { characterId: 200 },
      强盗: { characterId: 201 },
      武林高手: { characterId: 202 },
      老虎: { hp: 150, attack: 35, defence: 20, solo: true },
      毒蛇: { hp: 60, attack: 10, defence: 5, solo: true },
    };
  }

  loadCharacters();
  loadItems();
  loadSkills();
  buildMapsFromConfig();

  initialized = true;
}

/** 重置缓存（仅测试用） */
export function resetConfigsForTest(): void {
  initialized = false;
  mapsByName.clear();
  itemsByName.clear();
  itemsById.clear();
  skillsByName.clear();
  skillsById.clear();
  charactersById.clear();
  charactersByName.clear();
  dialogsById.clear();
}

// ============================================================================
// 查询 API
// ============================================================================

export function getTemplates(): GameTemplates {
  initConfigs();
  return templates;
}

export function getMap(name: string): MapInfo | undefined {
  initConfigs();
  return mapsByName.get(name);
}

export function getAllMapNames(): string[] {
  initConfigs();
  return [...mapsByName.keys()];
}

export function getItem(name: string): ItemConfig | undefined {
  initConfigs();
  return itemsByName.get(name);
}

export function getSkill(name: string): SkillConfig | undefined {
  initConfigs();
  return skillsByName.get(name);
}

export function getSkillById(id: number): SkillConfig | undefined {
  initConfigs();
  return skillsById.get(id);
}

/** damageType 数字 → calculateStaminaCost 字符串键 */
export function mapDamageTypeToStaminaCost(damageType: number): string {
  switch (damageType) {
    case 1:
      return 'absorbMp';
    case 2:
      return 'poison';
    case 3:
      return 'depoison';
    case 4:
      return 'heal';
    default:
      return 'normal';
  }
}

export function getSkillAttackAtLevel(skillName: string, levelIndex = 0): number {
  const skill = getSkill(skillName);
  if (!skill || !skill.levels.length) return 0;
  const idx = Math.min(levelIndex, skill.levels.length - 1);
  return skill.levels[idx][0] ?? 0;
}

export function getCharacterByName(name: string): CharacterConfig | undefined {
  initConfigs();
  return charactersByName.get(name);
}

export function getDialog(dialogId: string): DialogConfig | undefined {
  initConfigs();
  return dialogsById.get(dialogId);
}

export function getEnemyTemplate(enemyName: string): EnemyTemplate | undefined {
  initConfigs();
  const entry = templates.enemies[enemyName];
  if (!entry) return undefined;
  return resolveEnemyTemplate(entry);
}

export function isWeapon(item: ItemConfig): boolean {
  return item.type === 1 && item.equipmentType >= 0 && item.addAttack > 0;
}

export function isArmor(item: ItemConfig): boolean {
  return item.type === 1 && item.equipmentType >= 0 && item.addDefence > 0;
}

export function isConsumable(item: ItemConfig): boolean {
  return (
    item.useAddHp > 0 ||
    item.useAddMp > 0 ||
    item.useAddStamina > 0 ||
    item.useDePoison > 0 ||
    (item.useAddAttack ?? 0) > 0 ||
    (item.useAddAgility ?? 0) > 0 ||
    (item.useAddDefence ?? 0) > 0 ||
    (item.useAddPoison ?? 0) > 0 ||
    isSkillBook(item)
  );
}

export function isSkillBook(item: ItemConfig): boolean {
  return item.type === 2 && (item.skillId ?? 0) > 0;
}

/** 校验 assets 完整性（CLI / CI 用） */
export function validateAssets(): string[] {
  resetConfigsForTest();
  initConfigs();

  const errors: string[] = [];
  const index = loadJson<{ characters: Array<{ id: number; name: string }> }>(
    'characters/index.json',
  );

  for (const info of index.characters) {
    const path = join(ASSETS_DIR, 'characters', `${info.id}.json`);
    try {
      readFileSync(path, 'utf-8');
    } catch {
      errors.push(`Missing character file: characters/${info.id}.json (${info.name})`);
    }
  }

  const charFiles = readdirSync(join(ASSETS_DIR, 'characters')).filter((f) =>
    /^\d+\.json$/.test(f),
  );
  const indexIds = new Set(index.characters.map((c) => c.id));
  for (const file of charFiles) {
    const id = Number.parseInt(file.replace('.json', ''), 10);
    if (!indexIds.has(id)) {
      errors.push(`Character file ${file} not listed in characters/index.json`);
    }
  }

  for (const mapName of getAllMapNames()) {
    const map = getMap(mapName)!;
    for (const shopItem of map.shops) {
      if (!getItem(shopItem)) {
        errors.push(`Map "${mapName}" shop references unknown item: ${shopItem}`);
      }
    }
    for (const conn of map.connections) {
      if (!getMap(conn)) {
        errors.push(`Map "${mapName}" connection target unknown: ${conn}`);
      }
    }
  }

  for (const enemyName of Object.keys(templates.enemies)) {
    if (!getEnemyTemplate(enemyName)) {
      errors.push(`Enemy template unresolved: ${enemyName}`);
    }
  }

  for (const skillName of templates.defaultCharacter.skills ?? ['基本拳法']) {
    if (!getSkill(skillName)) {
      errors.push(`Default skill not found in skills.json: ${skillName}`);
    }
  }

  resetConfigsForTest();
  return errors;
}
