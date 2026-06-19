# 金庸群侠传 · 智能体操作手册

面向 Agent 的完整玩法与逻辑说明。玩家向文案见 [player-guide.md](player-guide.md)；叙事风格见 [AGENTS.md](../AGENTS.md)。

---

## 1. 核心职责

你是**叙述者 + 执行者**，必须：

1. **只通过** `scripts/game-engine.ts` 改变游戏状态，禁止手改 `save/game-state.json` 或心算数值。
2. **每次状态变更后**引擎自动存档；回复结束前可幂等调用 `saveGameState(state)`。
3. **用武侠文风**叙述 API 返回的 `message`，勿向玩家暴露函数名。
4. **失败时**根据 `success: false` 的 `message` 用自然语言解释，并给出可行替代（如「银两不足，可先卖…」→ 本版无出售，应建议去商人处或减少购买）。
5. **数值以引擎为准**：伤害、经验、升级、物品消耗均由 `game-logic.ts` / `game-engine.ts` 计算。

---

## 2. 每轮决策流程

```
玩家输入
  ↓
解析意图（可含多步：「去平安镇买铁剑」）
  ↓
若无 state → loadOrCreateGame(createNewGame, '主角')
  ↓
按顺序调用 API（移动 → 遇敌？→ 购物 → …）
  ↓
moveTo 若返回 encounter → 必须 startBattle 并打完或玩家死亡
  ↓
战斗后 isDead(state) ? → 死亡结算 + restartGame()
  ↓
getStatus(state) 生成状态栏，附在回复末尾
  ↓
buildChoicePrompt(state) → Host 渲染点选 UI（MCP Elicitation / AskQuestion / 飞书卡片）
  ↓
玩家点选 → resolveOption(state, optionId)
```

**标准契约**：优先 `buildChoicePrompt` + Host UI；详见 [host-adapters.md](host-adapters.md)。

**数字 fallback**：无 UI 能力时，Agent 可展示编号列表；玩家输入 `1`–`9` → `resolveOption(state, getOptions(state)[n-1].id)`。

**复合指令**：按逻辑顺序逐步调用。例：「去平安镇买铁剑并装备」→ `moveTo` → 若 `encounter` 先战斗 → `buyItem` → `equipItem`。

**续玩 vs 新游戏**：

| 场景 | 做法 |
|------|------|
| 「jy / 开始游戏」 | `loadOrCreateGame`；`isNewGame === true` 时做首登引导 |
| 「重新开始 / 新游戏」 | `restartGame()`，勿只 `deleteSave` 不落盘 |
| 战斗后 HP≤0 | 死亡叙述 → `restartGame()` |

---

## 3. 游戏规则（引擎实现）

### 3.1 时间与移动

- **`moveTo(state, destination)`** 成功时：
  - 更新 `state.location`
  - 体力 **-5**（不低于 0）
  - **周数 +1**
  - 若中毒/受伤，触发每周掉血（见下）
  - 可能触发 **随机遇敌**（见 3.6）
- **目的地**必须是当前地图 `connections` 中的**精确名称**（如「平安镇」，非「平安」）。
- **`destination === 'random'`**：随机选一条相连道路（玩家说「随便走走」时用）。

### 3.2 中毒与受伤

移动推进周数后（`advanceWeekEffects`）：

- 中毒掉血 = `floor(中毒值 / 10)`，HP 最低保留 **1**
- 受伤掉血 = `floor(受伤值 / 20)`，HP 最低保留 **1**
- **`rest(state)`** 可满血满内力满体力并清零中毒、受伤。

### 3.3 物品

| 物品 | 效果（配置值，实际恢复量可更少） |
|------|----------------------------------|
| 金创药 | +HP |
| 小还丹 | +MP |
| 干粮 | +体力 |
| 解毒丸 | 解毒 |

**重要**：`useItem` 按**实际收益**扣物品；生命/内力/体力已满或无毒时 **不消耗**，返回失败 message。叙述时引用 API 返回的实际恢复量。

### 3.4 装备

- `equipItem` 仅支持**武器**（铁剑、钢刀等）和**防具**（布衣、皮甲等）。
- 装备后攻击/防御在战斗中通过 `getEffectiveAttack` / `getEffectiveDefence` 生效。
- 装备**不消耗**背包数量（与使用品不同）。

### 3.5 升级

- 击败敌人获得经验：`10 + 敌人maxHp/10`
- 升级所需：`floor(100 × 1.5^(等级-1))`
- 最高 **Lv.100**；满级后 `getStatus` 显示「经验: N（已满级）」
- 升级时 maxHp/maxMp/攻防提升，HP/MP 回满

### 3.6 随机遇敌

配置于 `assets/templates.json` 各地图 `encounters` 字段。当前实现：

| 地点 | 概率 | 敌人池 |
|------|------|--------|
| 山洞 | 20% | 山贼、强盗、老虎 |

`moveTo` 抵达后若触发，返回 `{ encounter: '山贼' }` 等。**Agent 必须**在同一轮或下一轮立即 `startBattle(state, encounter)` 并进入战斗循环，不可忽略。

### 3.7 商店与对话

- **`buyItem`**：物品须在**当前地点** `shops` 列表中，且银两 ≥ 价格。
- **`talkTo`**：NPC 名须与当前地点 `npcs` **完全一致**；返回 `npc` 角色卡、`choices?`、`context?`、`events?`。
- **`talkTo(state, 'random')`**：随机与在场 NPC 对话。
- **`chooseDialog(state, dialogId, choiceIndex)`**：推进对话分支，执行 choice actions（setFlag/addItem/battle/heal）。
- 有配置对话的 NPC 返回「说话者：「台词」」格式；Agent 基于 `npc.persona` 扩写，数值以引擎为准。

### 3.8 事件与任务（flags）

- `game-config.json` 中 `events` 已由 `event-engine.ts` 接入。
- **`auto` 事件**：`moveTo` 抵达、`createNewGame` 首次落点触发（如小村 `village_start`）。
- **`interact` 事件**：通过 `getOptions` 生成探索选项，`resolveOption` 触发（如山洞 `cave_treasure`）。
- **`talk` 事件**：`talkTo` 时按 NPC 名与条件触发（如 `cave_master_quest`）。
- `state.flags` 持久化；条件 `flag` / `level` / `item` 由引擎判定。

### 3.9 行动选项与 PlayerChoicePrompt

- **`buildChoicePrompt(state)`**：生成 Host 无关的 `PlayerChoicePrompt`（`choices[].value` = `ActionOption.id`）。
- **`toMcpElicitationParams(prompt)`** / **`fromElicitationResponse(content)`**：MCP Elicitation 映射。
- **`toFeishuInteractiveCard(prompt)`**：飞书交互卡片 JSON。
- **`getOptions(state)`**：内部行动列表；与 `buildChoicePrompt().choices[].value` 一一对应。
- **`resolveOption(state, optionId)`**：按 id 前缀分发到 talk/move/buy/interact/rest/status/explore/paginate/dialog。
- 每轮回复末尾 MUST 输出 `buildChoicePrompt`；Host 有 UI 时禁止让玩家打字选行动。

### 3.10 武功

- 新角色默认：**基本拳法**（不耗内力）。
- **`learnSkill`**：武功须存在于 `assets/skills.json`；已学会则失败。
- **`useSkillInBattle`**：须已学会且内力 ≥ 消耗；消耗公式见 `game-logic.ts`。
- 武功 `skillLevels` 0–9 对应 Lv.1–10；每次战斗使用 +1~3 熟练度，满 100 升一级
- 死亡后（hp≤0）不可休息、移动、战斗；须 `restartGame()`

---

## 4. 战斗系统

### 4.1 开战

```typescript
const { success, message, enemies } = startBattle(state, '山贼')
```

- 敌人名须在 `templates.json` → `enemies` 中（山贼、强盗、武林高手、老虎、毒蛇）。
- **solo 敌人**（老虎、毒蛇及标记 solo）：仅 1 个。
- 其他敌人：随机 **1～3** 个，名称可能为 `山贼1`、`山贼2`…
- `enemies` 为**内存临时数组**，不写入存档；每轮战斗重新 `startBattle` 或沿用同一数组直至结束。

### 4.2 回合循环

```
while (尚有敌人 hp > 0 && !isDead(state)) {
  // 玩家回合
  attackEnemy(state, enemies, targetIndex)
  或 useSkillInBattle(state, enemies, skillName, targetIndex)

  // 若仍有存活敌人
  enemyAttack(state, enemies)  // 随机一名存活敌人反击

  // 检查 isDead(state)
}
```

- **`targetIndex`**：0 基，对应 `enemies` 数组下标；优先攻击 HP>0 的敌人。
- 普攻消耗 **3** 体力；武功也消耗 **3** 体力 + 内力。
- 敌人伤害 = `max(1, 敌人攻击 - 玩家有效防御)`。
- 玩家伤害由 `calculateDamage` 计算（含 ±20% 波动，**不可自行编造**）。

### 4.3 战斗叙述建议

- 每回合简述「你出招 / 敌人反击 / 剩余 HP」。
- 多敌人时说明攻击目标名称（用 `enemies[i].name`）。
- 战斗结束总结：经验获得、是否升级、剩余状态。

---

## 5. API 完整参考

所有函数自 `scripts/game-engine.ts` 导入。

### 存档与初始化

| 函数 | 返回 | 说明 |
|------|------|------|
| `loadOrCreateGame(createNewGame, name?)` | `{ state, isNewGame }` | 单用户默认档 |
| `loadOrCreateGameForUser(userId, createNewGame, name?)` | `{ state, isNewGame }` | 多用户 `save/users/{userId}.json` |
| `setSaveUserId(userId \| null)` | void | 切换当前会话存档目标 |
| `loadGameState(userId?)` | `GameState \| null` | 仅读取，不创建 |
| `saveGameState(state)` | void | 幂等手动存档 |
| `deleteSave()` | void | 仅删档；重开请用 `restartGame` |
| `restartGame(name?)` | `GameState` | 删档 + 新建 + 落盘 |
| `createNewGame(name)` | `GameState` | 新建并触发 auto 事件、落盘 |

### 查询

| 函数 | 说明 |
|------|------|
| `getStatus(state)` | 状态栏文本（含经验、中毒/受伤行） |
| `getInventory(state)` | 银两 + 物品列表 |
| `getSkills(state)` | 已学武功 |
| `getLocationInfo(state)` | 当前地点文本（含描述、险地提示） |
| `getLocationDetail(state)` | 结构化地点：description、atmosphere、dangerLevel、npcs |
| `getOptions(state)` | 当前可选行动列表（与 buildChoicePrompt 一致） |
| `buildChoicePrompt(state, ctx?)` | `PlayerChoicePrompt` 标准契约 |
| `buildChoicePromptFromTalk(talkResult, state)` | 对话分支选项契约 |
| `toMcpElicitationParams(prompt)` | MCP elicitation/create 参数 |
| `fromElicitationResponse(content)` | Elicitation 回传 → optionId |
| `toFeishuInteractiveCard(prompt)` | 飞书交互卡片 JSON |
| `getNpcContext(state, npc)` | LLM-NPC 约束包：card、constraints、availableActions |

### 探索与交互

| 函数 | 返回 | 失败常见原因 |
|------|------|--------------|
| `moveTo(state, dest)` | `{ success, message, encounter?, events?, locationDetail? }` | 不相连、无处可去 |
| `talkTo(state, npc)` | `TalkResult`（含 `npc?`, `choices?`, `context?`, `events?`） | NPC 不在场 |
| `chooseDialog(state, dialogId, index)` | `TalkResult` | 无效选项 |
| `resolveOption(state, optionId)` | `{ action, result }` | 未知 optionId |
| `rest(state)` | `{ success, message }` | 一般总成功 |
| `buyItem(state, item)` | `{ success, message }` | 非本店、无货、银两不足 |
| `useItem(state, item)` | `{ success, message }` | 无物品、非消耗品、无收益 |
| `equipItem(state, item)` | `{ success, message }` | 无物品、不可装备 |
| `learnSkill(state, skill)` | `{ success, message }` | 不存在、已学会 |

### 战斗

| 函数 | 说明 |
|------|------|
| `startBattle(state, enemyName)` | 返回 `enemies[]` |
| `attackEnemy(state, enemies, i)` | 返回 `{ message, enemyDefeated, playerDamage }` |
| `useSkillInBattle(state, enemies, skill, i)` | 返回 `{ success, message }` |
| `enemyAttack(state, enemies)` | 返回 `{ message, playerDefeated }` |
| `isDead(state)` | `character.hp <= 0` |

---

## 6. 世界速查（`assets/templates.json`）

地图只能走**相邻**连接；各门派经**平安镇**枢纽。

| 地点 | 可前往 | NPC | 商店 |
|------|--------|-----|------|
| 小村 | 平安镇、山洞 | 村长、商人 | 金创药、小还丹、干粮 |
| 平安镇 | 小村、华山、桃花岛、全真教、光明顶 | 守卫、商店老板、客栈老板 | 铁剑、钢刀、布衣、皮甲、金创药、小还丹 |
| 山洞 | 小村 | 神秘人 | 无（20% 遇敌） |
| 华山 | 平安镇 | 王重阳 | 无 |
| 桃花岛 | 平安镇 | 黄药师、黄蓉 | 无 |
| 全真教 | 平安镇 | 王重阳、周伯通 | 无 |
| 光明顶 | 平安镇 | 张无忌 | 无 |

**可战斗敌人**（任意地点可主动开战）：山贼、强盗、武林高手、老虎、毒蛇。

**新角色初始**：小村、100 银两、金创药×5、干粮×3、基本拳法、HP/MP/体力满值。

> 完整数值与扩展设计见 `assets/` 与 [game-design.md](game-design.md)。**禁止**在叙述中编造未在 assets 出现的物品价、敌人 HP 或地图连接。

---

## 7. GameState 结构（只读理解）

```typescript
interface GameState {
  character: {
    name, level, exp, hp, maxHp, mp, maxMp, stamina
    poison, hurt
    attributes   // 攻防等，来自 game-logic DEFAULT_ATTRIBUTES
    equipment: { weapon, armor }
    skills: string[]
    skillLevels: Record<string, number>
  }
  inventory: { silver, items: [{ id, name, count }] }
  location: string
  week: number
  flags, visitedMaps, completedQuests, team
}
```

---

## 8. 禁止与常见错误

| 错误 | 正确做法 |
|------|----------|
| 手改 JSON 存档 | 只调 engine API |
| 忽略 `moveTo.encounter` | 立即 `startBattle` |
| 编造伤害/经验数字 | 只用 API 返回值叙述 |
| 使用不存在的 NPC（如「店小二」） | 查 `getLocationInfo` 或上表 |
| 跨地图一步到达（小村→华山） | 先经平安镇 |
| 满血仍描述「服下药丸」且扣物品 | 先 `useItem`，失败则如实告知 |
| 死亡后只删档不新建 | `restartGame()` |
| 战斗中使用已阵亡敌人的 index | 选 `hp > 0` 的下标 |
| 向玩家展示 `moveTo(state,…)` 代码 | 武侠化叙述 |

---

## 9. 交互示例（完整链）

### 移动遇敌

```
moveTo(state, '山洞')
→ success, encounter: '老虎'
→ startBattle(state, '老虎')
→ 循环 attackEnemy / enemyAttack 直至结束
→ getStatus(state)
```

### 帮助

```
getLocationInfo(state) + getStatus(state)
→ 按 AGENTS.md 模板用自然语言说明，附状态栏
```

### 死亡

```
isDead(state) === true
→ 叙述陨落 + 结算（level, week, silver）
→ restartGame('主角')
→ 简短新人生开场 + 状态栏
```

---

## 10. 文档索引

| 文件 | 用途 |
|------|------|
| [SKILL.md](../SKILL.md) | Skill 入口、快速开始 |
| [AGENTS.md](../AGENTS.md) | 叙事、首登、帮助模板 |
| [player-guide.md](player-guide.md) | 玩家 FAQ、地图图 |
| [game-design.md](game-design.md) | 公式与设计细节 |
| `scripts/game-engine.ts` | 唯一 API |
| `scripts/game-logic.ts` | 唯一公式 |
| `assets/templates.json` | 地图、敌人、初始配置 |
