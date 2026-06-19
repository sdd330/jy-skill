# 金庸群侠传 · 对话武侠 RPG

[![CI](https://github.com/sdd330/jy-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/sdd330/jy-skill/actions/workflows/ci.yml)
[![Release](https://github.com/sdd330/jy-skill/actions/workflows/release.yml/badge.svg)](https://github.com/sdd330/jy-skill/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/github/license/sdd330/jy-skill)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/sdd330/jy-skill?include_prereleases)](https://github.com/sdd330/jy-skill/releases)

独立的 Cursor Agent Skill。玩家通过自然语言与智能体对话，体验金庸武侠冒险。

## 特性

- 自然语言交互，无需记忆指令
- 自动记忆游戏状态（引擎在每次状态变更后写入 `save/game-state.json`，原子替换防损坏）
- 回合制战棋战斗
- 116 个金庸角色、25 种武功、28 种物品（`assets/` 驱动）

## 玩家快速上手

1. **安装 skill**（见下方「安装」）到 Cursor 项目或全局 skills 目录。
2. 在对话中说 **`jy`** 或 **「开始游戏」** —— 自动读档或从小村开始新冒险。
3. 用**自然语言**描述你想做的事，无需记指令。

常用说法示例：

- 「去平安镇」「和村长聊聊」
- 「买一把铁剑」「用金创药」
- 「攻击山贼」「查看背包」「休息」
- 「帮助」或「怎么玩」查看说明

完整地图、战斗与 FAQ 见 **[玩家手册](references/player-guide.md)**。

---

## 安装

本仓库即完整 skill，**不依赖任何 monorepo 或子项目**。

### Cursor

任选一种方式注册：

**项目内（推荐）**

```bash
# 在本仓库根目录直接开发；或复制到目标项目的 skill 目录
mkdir -p .cursor/skills && cp -R /path/to/jy .cursor/skills/jy
```

**个人全局**

```bash
mkdir -p ~/.cursor/skills && cp -R /path/to/jy ~/.cursor/skills/jy
```

Agent 读取 `SKILL.md` 与 [AGENTS.md](AGENTS.md) 即可运行；玩家说明见 [references/player-guide.md](references/player-guide.md)。

### 发版包

Git tag（`v*`）触发 [Release 工作流](.github/workflows/release.yml)，生成 `jy-skill.zip` 并发布 GitHub Release。

## CI/CD

| 工作流 | 触发 | 说明 |
|--------|------|------|
| [CI](.github/workflows/ci.yml) | push / PR → `main`、手动 `workflow_dispatch` | 并行：`static-checks`（lint/typecheck/validate）+ `test-coverage`（Vitest 100% 覆盖率 + Step Summary） |
| [Quality Gate](.github/workflows/quality-gate.yml) | 被 CI / Release 调用 | 可复用质量门禁（lint → typecheck → validate → test:coverage） |
| [Release](.github/workflows/release.yml) | tag `v*` | Quality Gate → 打包 `jy-skill.zip` → GitHub Release（tag 须与 `package.json` version 一致） |

Dependabot 每周检查 GitHub Actions 与 npm 依赖更新。

本地与 CI 对齐：

```bash
pnpm run ci
```

打包 skill 发版包（与 Release 工作流相同）：

```bash
pnpm run pack:skill
node scripts/pack-skill.mjs --verify
```

## 开发与测试

```bash
pnpm install
pnpm run ci                 # 与 CI 门禁一致
pnpm run check             # oxlint + oxfmt
pnpm run typecheck         # TypeScript 6
pnpm run validate          # SKILL.md 格式 + 资产校验
pnpm run validate:meta     # 仅 SKILL.md frontmatter
pnpm run validate:skill    # 仅 assets/
pnpm test                  # Vitest 全部测试
pnpm run test:logic        # 仅 game-logic 公式单元测试
pnpm run test:engine       # 仅 game-engine 集成测试
pnpm run test:coverage     # 覆盖率报告
pnpm run lint              # oxlint --fix
pnpm run format            # oxfmt
```

## 目录结构

```
jy/
├── SKILL.md              # 技能定义（含 YAML frontmatter）
├── AGENTS.md             # 智能体叙事指南
├── package.json          # pnpm 项目配置
├── pnpm-lock.yaml        # pnpm 锁文件
├── pnpm-workspace.yaml   # pnpm 构建白名单（esbuild）
├── .npmrc                # pnpm 配置
├── vite.config.ts        # Vite 8 + Vitest 配置
├── tsconfig.json         # TypeScript 6
├── .oxlintrc.json        # Oxlint
├── .oxfmtrc.json         # Oxfmt
├── scripts/
│   ├── game-engine.ts    # 唯一 API 入口
│   ├── game-logic.ts     # 核心公式
│   ├── config-loader.ts  # assets 加载
│   ├── persistence.ts    # 存档读写
│   ├── validate-skill.ts # SKILL.md 格式校验
│   └── validate-assets.ts
├── references/
│   ├── player-guide.md   # 玩家手册
│   └── game-design.md
├── assets/
│   ├── characters/
│   ├── skills.json
│   ├── items.json
│   ├── game-config.json
│   └── templates.json
└── save/
    └── .gitkeep            # 运行时存档目录占位
```

## 许可

MIT
