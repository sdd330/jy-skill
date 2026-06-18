# 金庸群侠传 · 对话武侠 RPG

基于金庸武侠世界的对话式 RPG 技能。玩家通过自然语言与智能体对话，体验武侠冒险。

## 特性

- 自然语言交互，无需记忆指令
- 自动记忆游戏状态
- 回合制战棋战斗
- 116 个金庸角色、25 种武功、28 种物品

## 使用

```
jy              # 开始游戏 / 继续游戏
jy 帮助         # 查看帮助
```

## 目录结构

```
jy/
├── SKILL.md              # 技能定义
├── AGENTS.md             # 智能体指南
├── scripts/
│   ├── game-engine.ts    # 游戏引擎
│   └── game-logic.ts     # 核心公式
├── references/
│   └── game-design.md    # 游戏设计文档
└── assets/
    ├── characters/       # 角色配置
    ├── skills.json       # 武功配置
    ├── items.json        # 物品配置
    ├── game-config.json  # 地图/战斗/对话
    └── templates.json    # 游戏模板
```

## 许可

MIT
