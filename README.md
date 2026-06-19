# 金庸群侠传 · 对话武侠 RPG

[![npm version](https://img.shields.io/npm/v/@sdd330dev/jy-skill)](https://www.npmjs.com/package/@sdd330dev/jy-skill)
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

包已发布至 npm：**[@sdd330dev/jy-skill](https://www.npmjs.com/package/@sdd330dev/jy-skill)**

### 项目内安装（推荐）

在 Cursor 项目根目录执行：

```bash
npm install @sdd330dev/jy-skill --save-dev
npx jy-skill install
```

使用 pnpm 或 yarn：

```bash
pnpm add -D @sdd330dev/jy-skill && pnpm exec jy-skill install
# 或
yarn add -D @sdd330dev/jy-skill && yarn jy-skill install
```

安装完成后，目录结构如下：

```
你的项目/
└── .cursor/skills/jy/    ← SKILL.md、assets/、scripts/ 等
```

在 Cursor 中打开该项目，对话里说 **`jy`** 或 **「开始游戏」** 即可。

### 全局安装（所有项目可用）

```bash
npm install -g @sdd330dev/jy-skill
jy-skill install --global
```

skill 将安装到 `~/.cursor/skills/jy`，任意 Cursor 项目均可加载。

### CLI 选项

| 选项 | 说明 |
|------|------|
| `--global` | 安装到 `~/.cursor/skills/jy` 而非当前项目 |
| `--force` | 覆盖已存在的 skill 目录 |
| `--copy` | 强制复制文件（默认优先 symlink；Windows 无权限时自动 fallback） |

示例：`npx jy-skill install --force --copy`

> **注意**：`npm install` 只把包放入 `node_modules`，不会自动写入 `.cursor/`。必须再执行 **`jy-skill install`**（无 postinstall，避免 monorepo/CI 误写配置）。

### 其他安装方式

**GitHub Release（离线 / 无 npm）**

从 [Releases](https://github.com/sdd330/jy-skill/releases) 下载 `jy-skill.zip`，解压后：

```bash
mkdir -p .cursor/skills
unzip jy-skill.zip -d .cursor/skills/jy
```

**从源码开发**

克隆本仓库，在本目录用 pnpm 开发与测试（见下方「开发与测试」）。本地调试也可手动链接：

```bash
mkdir -p .cursor/skills
ln -s "$(pwd)" .cursor/skills/jy   # macOS / Linux
# Windows 或 symlink 失败时：cp -R . .cursor/skills/jy
```

### 发布与版本

Git tag（`v*`）触发 [Release 工作流](.github/workflows/release.yml)，生成 `jy-skill.zip` 并同步发布到 [npm @sdd330dev/jy-skill](https://www.npmjs.com/package/@sdd330dev/jy-skill)（GitHub Secrets 需配置 `NPM_TOKEN`）。

**维护者：本机发布到 npm**

```bash
pnpm run ci
# 使用 Granular Access Token（Publish + Bypass 2FA），或 npm login 后带 OTP：
npm publish --access public   # 或 pnpm run publish:npm
```

Agent 读取 [SKILL.md](SKILL.md)、[AGENTS.md](AGENTS.md) 与 [智能体操作手册](references/agent-handbook.md) 即可运行；玩家说明见 [references/player-guide.md](references/player-guide.md)。

---

## CI/CD

| 工作流 | 触发 | 说明 |
|--------|------|------|
| [CI](.github/workflows/ci.yml) | push / PR → `main`、手动 `workflow_dispatch` | 调用 [Quality Gate](.github/workflows/quality-gate.yml) |
| [Quality Gate](.github/workflows/quality-gate.yml) | 被 CI / Release 调用 | 7 项并行检查 + **Gate** 汇总 Job |
| [Release](.github/workflows/release.yml) | tag `v*` | Quality Gate → npm + GitHub Release（tag 须与 `package.json` version 一致） |

**Quality Gate 并行 Job**

| Job | 命令 | 说明 |
|-----|------|------|
| Lint · Format | `pnpm run check` | oxlint + oxfmt |
| Typecheck | `pnpm run typecheck` | TypeScript |
| Validate | `pnpm run validate` | SKILL 元数据、assets、版本对齐、文档链接 |
| Pack · Verify | `pnpm run validate:pack` | zip 发版包 |
| NPM pack · Verify | `pnpm run validate:npm` | npm tarball 内容 |
| Dependency audit | `pnpm run audit:ci` | `pnpm audit --audit-level=high` |
| Test · Coverage | `pnpm run test:coverage` | Vitest 100% 覆盖率 + Step Summary / artifact |

**Branch protection 建议**（GitHub 仓库 Settings → Branches）：将 **Quality Gate / Gate** 设为 Required status check，确保 PR 必须通过全部门禁方可合并。

Dependabot 每周检查 GitHub Actions 与 npm 依赖更新。

本地与 CI 对齐：

```bash
pnpm run ci
```

打包 skill 发版包（Release 工作流在 tag 推送时使用）：

```bash
pnpm run pack:skill
pnpm run validate:pack     # zip 打包校验
pnpm run validate:npm      # npm pack 内容校验
```

## 开发与测试

```bash
pnpm install
pnpm run ci                 # 与 CI 门禁一致
pnpm run check             # oxlint + oxfmt
pnpm run typecheck         # TypeScript 6
pnpm run validate          # meta + assets + versions + docs
pnpm run validate:pack     # 打包 zip 并校验
pnpm run validate:versions # package.json 与 SKILL.md 版本
pnpm run validate:docs     # 必备文档与链接
pnpm run audit:ci          # 依赖安全（high+）
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
│   ├── validate-assets.ts
│   ├── validate-pack.ts
│   ├── validate-versions.ts
│   └── validate-docs.ts
├── references/
│   ├── agent-handbook.md # 智能体操作手册（规则/API/地图）
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
