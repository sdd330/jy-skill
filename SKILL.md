---
name: jy
description: >-
  金庸群侠传对话式武侠 RPG：移动、NPC、商店、物品、武功、回合战斗、存档与新人引导。
  Agent 须读 references/agent-handbook.md 掌握完整玩法与 API；玩家说 jy/开始游戏/帮助/金庸群侠传时使用。
license: MIT
metadata:
  version: "0.3.1"
disable-model-invocation: false
---

# 金庸群侠传 · 对话武侠 RPG

独立 Cursor Agent Skill，自包含 `scripts/`、`assets/` 与存档。

## 安装

```bash
npm install @sdd330dev/jy-skill --save-dev && npx jy-skill install
```

全局：`npm install -g @sdd330dev/jy-skill && jy-skill install --global`

## 智能体必读

**完整玩法、API、战斗循环、地图与禁忌** → [references/agent-handbook.md](references/agent-handbook.md)（操作手册，优先阅读）

| 文档 | 读者 | 内容 |
|------|------|------|
| [agent-handbook.md](references/agent-handbook.md) | Agent | 规则、API、战斗、地图速查、错误清单 |
| [AGENTS.md](AGENTS.md) | Agent | 武侠叙事、首登/帮助模板、输出格式 |
| [player-guide.md](references/player-guide.md) | 玩家 | FAQ、地图、生存技巧 |
| [game-design.md](references/game-design.md) | 开发 | 公式与设计细节 |

**硬性约束**

- 唯一 API：`scripts/game-engine.ts`；唯一公式：`scripts/game-logic.ts`
- 禁止手改存档、禁止编造伤害/价格/地图连接
- `moveTo` 返回 `encounter` 时**必须** `startBattle` 并打完
- 每轮回复末尾附 `getStatus(state)` 状态栏

## 何时使用

玩家说「jy」「开始游戏」「金庸群侠传」，或以自然语言进行武侠冒险时加载本 skill。

| 玩家说法 | Agent 动作 |
|----------|------------|
| jy / 开始游戏 | `loadOrCreateGame`；`isNewGame` 则首登引导（见 AGENTS.md） |
| 帮助 / 怎么玩 | `getLocationInfo` + 帮助模板，勿堆砌 API 名 |
| 重新开始 / 新游戏 | `restartGame()` |
| 其他 | 解析意图 → 对应 API → 武侠叙述 + 状态栏 |

## 快速开始

```typescript
import {
  loadOrCreateGame,
  createNewGame,
  saveGameState,
  moveTo,
  startBattle,
  attackEnemy,
  enemyAttack,
  isDead,
  getStatus,
  getLocationInfo,
  restartGame,
} from './scripts/game-engine'

const { state, isNewGame } = loadOrCreateGame(createNewGame, '主角')

const move = moveTo(state, '山洞')
if (move.encounter) {
  const { enemies } = startBattle(state, move.encounter)!
  // 战斗循环见下文
}

saveGameState(state) // 可选，引擎已自动存档
```

## 每轮工作流

1. **加载**：无 `state` 时 `loadOrCreateGame(createNewGame, '主角')`
2. **执行**：按玩家意图调用 API（复合指令分步执行）
3. **遇敌**：`moveTo` → `encounter?` → `startBattle` → 战斗循环
4. **死亡**：`isDead` → 叙述结算 → `restartGame()`
5. **输出**：武侠叙述 + `getStatus(state)` 状态栏

## 玩家意图 → API

| 意图 | API | 要点 |
|------|-----|------|
| 移动 / 随便走走 | `moveTo(state, dest)` | `dest='random'` 随机相邻；返回 `encounter?` |
| 对话 | `talkTo(state, npc)` | NPC 名须精确；`'random'` 随机 |
| 购买 | `buyItem(state, item)` | 仅当前地点商店 |
| 使用 | `useItem(state, item)` | 无收益不消耗 |
| 装备 | `equipItem(state, item)` | 武器/防具 |
| 学武功 | `learnSkill(state, skill)` | 须存在于 assets |
| 休息 | `rest(state)` | 满状态并解毒解伤 |
| 战斗 | `startBattle` + 循环 | 见下节 |
| 查看 | `getStatus` / `getInventory` / `getSkills` | |
| 帮助 | `getLocationInfo` | 当前可为之事 |
| 重开 | `restartGame(name?)` | 删档+新建+落盘 |

## 战斗循环（必遵）

```typescript
const battle = startBattle(state, enemyName)
if (!battle.success || !battle.enemies) return

let enemies = battle.enemies

while (enemies.some((e) => e.hp > 0) && !isDead(state)) {
  const i = enemies.findIndex((e) => e.hp > 0)
  attackEnemy(state, enemies, i)
  // 或 useSkillInBattle(state, enemies, '基本拳法', i)

  if (enemies.some((e) => e.hp > 0) && !isDead(state)) {
    enemyAttack(state, enemies)
  }
}

if (isDead(state)) {
  // 死亡叙述 → restartGame()
}
```

- `enemies` 仅存于内存，不写入存档
- `targetIndex` 选第一个 `hp > 0` 的敌人
- 伤害/经验以 API 为准，叙述时引用 `message`

## 核心规则摘要

| 系统 | 规则 |
|------|------|
| 移动 | 仅相邻地图；每次 -5 体力、+1 周；中毒/受伤每周掉血 |
| 山洞遇敌 | 抵达后 20% 概率，敌人：山贼/强盗/老虎 |
| 物品 | 满状态使用不扣物品；实际恢复量 ≤ 配置值 |
| 升级 | 经验 = floor(100×1.5^(Lv-1))；上限 Lv.100 |
| 伤害 | 武力+技能攻击-防御；±20% 波动；最低 1 |

公式详见 [game-design.md](references/game-design.md) 与 `game-logic.ts`。

## 输出格式

```
👤 角色名 | Lv.等级 | 经验: …
❤️ hp/maxHp | 💠 mp/maxMp | ⚡ stamina/100
💰 银两 | 📍 位置 | 📅 第N周
```

满级显示「经验: N（已满级）」；中毒/受伤时额外一行。

## 交互示例

**移动 + 遇敌 + 战斗**

```
玩家: "进山洞看看"
→ moveTo(state, '山洞')  // 若 encounter='山贼'
→ startBattle → 战斗循环 → getStatus
```

**复合操作**

```
玩家: "去平安镇买铁剑装备上"
→ moveTo('平安镇') → buyItem('铁剑') → equipItem('铁剑')
```

**首登 / 帮助 / 重开** — 见 [AGENTS.md](AGENTS.md) 与 [agent-handbook.md](references/agent-handbook.md) 第 9 节。

## API 索引

| 类别 | 函数 |
|------|------|
| 存档 | `loadOrCreateGame`, `loadGameState`, `saveGameState`, `deleteSave`, `restartGame` |
| 初始化 | `createNewGame` |
| 查询 | `getStatus`, `getInventory`, `getSkills`, `getLocationInfo` |
| 探索 | `moveTo`, `talkTo`, `rest` |
| 物品 | `buyItem`, `useItem`, `equipItem`, `learnSkill` |
| 战斗 | `startBattle`, `attackEnemy`, `useSkillInBattle`, `enemyAttack`, `isDead` |

参数、返回值与失败原因 → [agent-handbook.md](references/agent-handbook.md) 第 5 节。

## 数据与存档

- 地图/NPC/商店/敌人：`assets/templates.json`（**勿编造**）
- 武功/物品数值：`assets/skills.json`、`assets/items.json`
- 存档：`save/game-state.json`（引擎原子写入，自动迁移旧档）

## 目录

```
jy/
├── SKILL.md
├── AGENTS.md
├── references/
│   ├── agent-handbook.md   # Agent 操作手册（必读）
│   ├── player-guide.md
│   └── game-design.md
├── scripts/
│   ├── game-engine.ts      # 唯一 API
│   ├── game-logic.ts
│   ├── config-loader.ts
│   └── persistence.ts
└── assets/
```
