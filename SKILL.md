---
name: jy
description: >-
  金庸群侠传对话式武侠 RPG：移动、NPC 对话、商店、物品、武功学习与回合制战斗，支持存档。
  Use when the user says jy, 开始游戏, or 金庸群侠传, or when driving game actions via scripts/game-engine.ts.
license: MIT
metadata:
  version: "0.2.0"
disable-model-invocation: false
---

# 金庸群侠传 · 对话武侠 RPG

独立 Cursor Agent Skill，自包含 `scripts/`、`assets/` 与存档，不依赖外部 monorepo。

## 何时使用

玩家说「jy」「开始游戏」「金庸群侠传」，或需要以自然语言驱动武侠冒险时加载本 skill。

开始游戏后须同时遵循 [AGENTS.md](AGENTS.md) 叙事规范（武侠文风、沉浸感、注意事项）。

## 快速开始

```typescript
import {
  loadOrCreateGame,
  createNewGame,
  saveGameState,
  moveTo,
  getStatus,
} from './scripts/game-engine'

// 开始或继续（无存档时自动创建并落盘）
let state = loadOrCreateGame(createNewGame, '主角')

// 状态变更操作会自动存档；也可每轮回复结束前幂等调用
const result = moveTo(state, '平安镇')
saveGameState(state) // 可选
```

命令行：`jy` 开始/继续 · `jy 帮助` 查看帮助

## Agent 工作流

### 玩家意图 → API

| 玩家意图 | 调用函数 |
|----------|----------|
| 移动 | `moveTo(state, destination)` |
| 对话 | `talkTo(state, npcName)` |
| 购买 | `buyItem(state, itemName)` |
| 使用 | `useItem(state, itemName)` |
| 装备 | `equipItem(state, itemName)` |
| 学武功 | `learnSkill(state, skillName)` |
| 休息 | `rest(state)` |
| 战斗 | `startBattle(state, enemyName)` |
| 查询状态 | `getStatus(state)` / `getInventory(state)` / `getSkills(state)` |

每次状态变更后引擎自动写入 `save/game-state.json`；Agent 仍可在每轮回复结束前调用 `saveGameState(state)`（幂等）。

### 战斗循环

1. `startBattle(state, enemyName)` 获取敌人列表
2. 循环直到战斗结束：
   - `attackEnemy(state, enemies, targetIndex)` 或 `useSkillInBattle(state, enemies, skillName, targetIndex)` 攻击
   - `enemyAttack(state, enemies)` 敌人反击
   - `isDead(state)` 检查死亡
3. 战斗中的角色状态变更会自动存档（敌人列表为内存临时状态）

### 死亡重置

`isDead(state)` 为 true 时：叙述死亡 → 显示结算（等级、存活周数、资产）→ `deleteSave()` → `createNewGame()` 重新开始。

### 输出格式

每次回复末尾附带状态栏：

```
👤 角色名 | Lv.等级 | ❤️ 生命/最大 | 💠 内力/最大 | ⚡ 体力/100
💰 银两 | 📍 位置 | 📅 第N周
```

## 交互示例

**示例 1 — 移动购物**

```
玩家: "去平安镇买把铁剑"
→ moveTo(state, '平安镇')   // 自动存档
→ buyItem(state, '铁剑')    // 自动存档
→ 武侠叙述购买结果 + 状态栏
```

**示例 2 — 对话**

```
玩家: "和店小二聊聊"
→ talkTo(state, '店小二')
→ 叙述对话内容 + 状态栏
```

**示例 3 — 战斗**

```
玩家: "攻击山贼"
→ startBattle(state, '山贼')
→ attackEnemy(state, enemies, 0) → enemyAttack(state, enemies) → 重复直至结束
→ 叙述战斗过程与结果 + 状态栏
```

## 目录

```
jy/
├── SKILL.md
├── AGENTS.md              # 智能体叙事与流程
├── vite.config.ts         # Vite 8 + Vitest
├── tsconfig.json          # TypeScript 6
├── .oxlintrc.json         # Oxlint
├── .oxfmtrc.json          # Oxfmt
├── scripts/
│   ├── game-engine.ts     # 唯一 API 入口
│   ├── game-logic.ts      # 核心公式
│   ├── config-loader.ts   # assets 配置加载
│   ├── persistence.ts     # save/game-state.json
│   ├── validate-skill.ts  # SKILL.md 格式校验
│   └── validate-assets.ts # 资产校验 CLI
├── references/
│   └── game-design.md     # 完整设计文档
├── assets/                # 116 角色 / 武功 / 物品 / 地图
└── save/
    └── game-state.json    # 运行时存档（自动创建）
```

## API 入口（game-engine.ts）

| 类别 | 函数 |
|------|------|
| 存档 | `loadOrCreateGame`, `loadGameState`, `saveGameState`, `deleteSave` |
| 初始化 | `createNewGame(name)` |
| 查询 | `getStatus`, `getInventory`, `getSkills` |
| 探索 | `moveTo`, `talkTo`, `rest` |
| 物品 | `buyItem`, `useItem`, `equipItem`, `learnSkill` |
| 战斗 | `startBattle`, `attackEnemy`, `useSkillInBattle`, `enemyAttack`, `isDead` |

叙事细节与完整流程见 [AGENTS.md](AGENTS.md)。

## 核心公式

数值计算**必须**遵循 `scripts/game-logic.ts`：

- 伤害 = 武力 + 技能攻击 - 防御（左右互搏 ×1.5，武学常识 +N/10，±20% 波动，最低 1）
- 升级经验 = floor(100 × 1.5^(等级-1))
- 内力消耗 = 基础消耗 × ((等级+1)/2)

详细公式与系统设计见 [references/game-design.md](references/game-design.md)。

## 数据表

地图、武功、物品、敌人等完整数据在 `assets/` 目录，由 `config-loader.ts` 加载。**不要在 SKILL 中硬编码数值。**

## 自动记忆

引擎在每次状态变更（移动、购物、战斗等）后自动写入 `save/game-state.json`（原子替换，防写入中断损坏）。Agent 可在每轮回复结束前额外调用 `saveGameState(state)`（幂等）。

开始游戏时调用 `loadOrCreateGame(createNewGame)`：无存档则新建并落盘，有存档则继续。
