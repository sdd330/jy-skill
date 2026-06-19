/**
 * 玩家选项标准契约 — Host 无关的选项导出与格式适配
 */

import type {
  ActionOption,
  DialogChoice,
  PlayerChoiceItem,
  PlayerChoicePrompt,
  McpElicitationParams,
  FeishuInteractiveCard,
} from './game-types';

export const CHOICES_PER_PAGE = 8;

export interface BuildChoicePromptContext {
  message?: string;
  dialogChoices?: DialogChoice[];
  dialogId?: string;
  page?: number;
  options?: ActionOption[];
}

export function optionsToChoiceItems(options: ActionOption[]): PlayerChoiceItem[] {
  return options.map((o) => ({
    value: o.id,
    label: o.label,
    description: o.hint,
    category: o.category,
  }));
}

export function paginateChoiceItems(
  items: PlayerChoiceItem[],
  page = 0,
  perPage = CHOICES_PER_PAGE,
): Pick<PlayerChoicePrompt, 'choices' | 'page' | 'hasMore' | 'totalPages'> {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * perPage;
  const slice = items.slice(start, start + perPage);
  const hasMore = start + perPage < items.length;

  const choices: PlayerChoiceItem[] = [...slice];
  if (safePage > 0) {
    choices.unshift({
      value: `__page_${safePage - 1}`,
      label: '上一页',
      category: 'nav',
    });
  }
  if (hasMore) {
    choices.push({
      value: `__page_${safePage + 1}`,
      label: '查看更多…',
      category: 'nav',
    });
  }

  return { choices, page: safePage, hasMore, totalPages };
}

export function buildChoicePrompt(
  options: ActionOption[],
  ctx: BuildChoicePromptContext = {},
): PlayerChoicePrompt {
  if (ctx.dialogChoices?.length) {
    return {
      type: 'player_choice',
      message: ctx.message ?? '请做出选择：',
      choices: ctx.dialogChoices.map((c) => ({
        value: dialogChoiceValue(ctx.dialogId ?? 'unknown', c.index),
        label: c.text,
        category: 'talk' as const,
      })),
      dialogChoices: ctx.dialogChoices,
      dialogId: ctx.dialogId,
    };
  }

  const allItems = optionsToChoiceItems(ctx.options ?? options);
  const { choices, page, hasMore, totalPages } = paginateChoiceItems(allItems, ctx.page ?? 0);

  return {
    type: 'player_choice',
    message: ctx.message ?? '江湖路远，接下来做什么？',
    choices,
    page,
    hasMore,
    totalPages,
  };
}

export function dialogChoiceValue(dialogId: string, choiceIndex: number): string {
  return `dialog:${dialogId}:${choiceIndex}`;
}

export function parseDialogChoiceValue(value: string): { dialogId: string; index: number } | null {
  if (!value.startsWith('dialog:')) return null;
  const parts = value.split(':');
  if (parts.length !== 3) return null;
  const index = Number.parseInt(parts[2]!, 10);
  if (Number.isNaN(index)) return null;
  return { dialogId: parts[1]!, index };
}

export function isPaginationValue(value: string): boolean {
  return value.startsWith('__page_');
}

export function parsePaginationValue(value: string): number | null {
  if (!isPaginationValue(value)) return null;
  const page = Number.parseInt(value.slice('__page_'.length), 10);
  return Number.isNaN(page) ? null : page;
}

export function toMcpElicitationParams(prompt: PlayerChoicePrompt): McpElicitationParams {
  const selectable = prompt.choices.filter((c) => c.category !== 'nav');
  return {
    mode: 'form',
    message: prompt.message,
    requestedSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          title: '选择行动',
          description: prompt.dialogId ? '对话分支' : undefined,
          oneOf: selectable.map((c) => ({
            const: c.value,
            title: c.description ? `${c.label} ${c.description}` : c.label,
          })),
        },
      },
      required: ['action'],
    },
  };
}

export function fromElicitationResponse(content: Record<string, unknown>): string | null {
  const action = content.action;
  if (typeof action === 'string' && action.length > 0) return action;
  return null;
}

export function toFeishuInteractiveCard(prompt: PlayerChoicePrompt): FeishuInteractiveCard {
  const actionButtons = prompt.choices.map((choice) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: choice.label },
    type: choice.category === 'nav' ? 'default' : 'primary',
    value: { optionId: choice.value },
  }));

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < actionButtons.length; i += 3) {
    rows.push({
      tag: 'action',
      actions: actionButtons.slice(i, i + 3),
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: prompt.message },
    },
    elements: rows,
  };
}

export function feishuCardToMessageContent(card: FeishuInteractiveCard): string {
  return JSON.stringify(card);
}

export function parseFeishuButtonValue(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const optionId = (payload as { optionId?: unknown }).optionId;
  return typeof optionId === 'string' ? optionId : null;
}
