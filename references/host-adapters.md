# Host 选项适配指南

jy 引擎输出统一的 **PlayerChoicePrompt** 标准契约，各 Host 按自身能力渲染 UI，回传 `choices[].value` 后调用 `resolveOption(state, optionId)`。

## 标准契约

```typescript
interface PlayerChoicePrompt {
  type: 'player_choice';
  message: string;
  choices: Array<{
    value: string;      // 回传用，如 talk_村长、move_平安镇
    label: string;
    description?: string;
    category?: string;
  }>;
  dialogChoices?: DialogChoice[];
  dialogId?: string;
  page?: number;
  hasMore?: boolean;
}
```

引擎 API：

| 函数 | 用途 |
|------|------|
| `buildChoicePrompt(state, ctx?)` | 从当前状态生成契约 |
| `buildChoicePromptFromTalk(state, talkResult)` | 对话含分支时生成契约 |
| `toMcpElicitationParams(prompt)` | 转为 MCP Elicitation schema |
| `fromElicitationResponse(content)` | 解析用户选择 → optionId |
| `toFeishuInteractiveCard(prompt)` | 转为飞书交互卡片 JSON |
| `resolveOption(state, optionId)` | 执行选中行动 |

---

## Host 适配矩阵

| Host | 渲染机制 | 集成方式 |
|------|----------|----------|
| **MCP 客户端** | [MCP Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation) `oneOf` 单选 | 运行 `scripts/mcp-server.ts`；工具返回 `mcpElicitation` |
| **Cursor Agent** | `AskQuestion`（语义同 Elicitation） | Skill 规则：每轮 `buildChoicePrompt` → AskQuestion 映射 value/label |
| **OpenClaw + 飞书** | 交互卡片按钮 | `build-feishu-card.ts` 或 `toFeishuInteractiveCard`；按钮 value 含 `optionId` |
| **纯文本 Agent** | 数字/文字 fallback | 仅当 Host 无 UI 能力时使用 1/2/3 |

**原则**：有 UI 能力则 **禁止** 让玩家打字选行动；无 UI 时才 fallback。

---

## MCP 客户端

### 启动 Server

```bash
npx tsx scripts/mcp-server.ts
```

Claude Desktop / Cursor MCP 配置示例：

```json
{
  "mcpServers": {
    "jy-skill": {
      "command": "npx",
      "args": ["tsx", "/path/to/jy/scripts/mcp-server.ts"],
      "cwd": "/path/to/jy"
    }
  }
}
```

### 工具

| 工具 | 说明 |
|------|------|
| `jy_load_game` | `playerId` 加载/新建（多用户存档） |
| `jy_resolve_action` | 执行 `optionId` |
| `jy_get_status` | 状态 + 最新 `playerChoice` |
| `jy_from_elicitation` | 解析 Elicitation 响应并执行 |

工具返回 JSON 含 `playerChoice` 与 `mcpElicitation`。Host 支持 Elicitation 时，用 `mcpElicitation` 渲染单选 UI；用户提交后调 `jy_from_elicitation` 或 `jy_resolve_action`。

### Elicitation 示例

```json
{
  "mode": "form",
  "message": "江湖路远，接下来做什么？",
  "requestedSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "title": "选择行动",
        "oneOf": [
          { "const": "talk_村长", "title": "和村长交谈" },
          { "const": "move_平安镇", "title": "前往平安镇" }
        ]
      }
    },
    "required": ["action"]
  }
}
```

用户选择后回传 `{ "action": "talk_村长" }` → `resolveOption(state, "talk_村长")`。

---

## Cursor Agent

Cursor 的 `AskQuestion` 与 MCP Elicitation 语义相同。Agent 工作流：

1. `buildChoicePrompt(state)` 获取选项
2. 调用 AskQuestion：`options[].id` = `choices[].value`，`label` = `choices[].label`
3. 用户点选 → `resolveOption(state, selectedValue)`
4. 武侠叙述 + 状态栏 + 新一轮 AskQuestion

`talkTo` 返回 `choices` 时，用 `buildChoicePromptFromTalk` 或 AskQuestion 展示对话分支；选中后 `chooseDialog` 或 `resolveOption`（`dialog:dialogId:index` 格式）。

**Fallback**：AskQuestion 不可用时，可输出编号列表（1/2/3），但应优先尝试 AskQuestion。

---

## OpenClaw + 飞书

### 前置

- 安装 [OpenClaw 飞书插件](https://docs.openclaw.ai/channels/feishu)（WebSocket 模式，免公网 Webhook）
- jy Skill 绑定到 Agent
- 多用户使用 `loadOrCreateGameForUser(open_id)` / MCP `playerId`

### 发卡片

```bash
# 演示：从小村状态生成卡片
npx tsx scripts/build-feishu-card.ts --demo

# 从 PlayerChoicePrompt JSON 生成
echo '{"type":"player_choice",...}' | npx tsx scripts/build-feishu-card.ts
```

输出 `msg_type: interactive` 与 `content` JSON，通过飞书 IM API 或 OpenClaw 发送。

### 按钮回调

按钮 `value` 为 `{ "optionId": "talk_村长" }`。收到 `card.action.trigger` 后：

1. 解析 `optionId`
2. `resolveOption(state, optionId)`
3. 叙述结果 + 发送新卡片（`buildChoicePrompt` → `toFeishuInteractiveCard`）

也可安装社区 Skill `feishu-interactive-cards`，由 Agent 将 `PlayerChoicePrompt` 转为 confirmation/choice 卡片。

---

## 多用户存档

| 场景 | API |
|------|-----|
| 单用户（Cursor 默认） | `loadOrCreateGame` → `save/game-state.json` |
| 飞书/OpenClaw 多用户 | `loadOrCreateGameForUser(userId)` → `save/users/{userId}.json` |
| MCP Server | 工具参数 `playerId` 自动隔离 |

`setSaveUserId(userId)` 可切换当前会话存档目标。

---

## 分页

选项超过 8 条时，`buildChoicePrompt` 自动分页，含「上一页」「查看更多…」导航项（`__page_N`）。  
`resolveOption(state, "__page_1")` 返回 `{ action: 'paginate', result: PlayerChoicePrompt }`，Host 重新渲染即可，不修改游戏状态。

---

## 对话分支 value 格式

| 类型 | value 格式 | 处理 |
|------|------------|------|
| 地图行动 | `talk_村长`、`move_平安镇`、`buy_铁剑` | `resolveOption` |
| 对话分支 | `dialog:village_elder:0` | `resolveOption` → `chooseDialog` |
| 分页 | `__page_0` | `resolveOption` → 新 prompt |
