import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildChoicePrompt,
  toMcpElicitationParams,
  fromElicitationResponse,
  toFeishuInteractiveCard,
  parseDialogChoiceValue,
  dialogChoiceValue,
  paginateChoiceItems,
  optionsToChoiceItems,
  CHOICES_PER_PAGE,
  feishuCardToMessageContent,
  parseFeishuButtonValue,
  isPaginationValue,
  parsePaginationValue,
} from './choice-prompt';
import { createNewGame, getOptions, resolveOption, deleteSave } from './game-engine';
import { resetConfigsForTest, initConfigs } from './config-loader';

describe('choice-prompt', () => {
  beforeEach(() => {
    deleteSave();
    resetConfigsForTest();
    initConfigs();
  });

  afterEach(() => {
    deleteSave();
  });

  it('buildChoicePrompt choices match getOptions ids', () => {
    const state = createNewGame('主角');
    const options = getOptions(state);
    const prompt = buildChoicePrompt(options);
    const optionIds = new Set(options.map((o) => o.id));
    const promptValues = prompt.choices.filter((c) => c.category !== 'nav').map((c) => c.value);
    for (const value of promptValues) {
      expect(optionIds.has(value)).toBe(true);
    }
    expect(prompt.type).toBe('player_choice');
  });

  it('toMcpElicitationParams produces oneOf schema', () => {
    const state = createNewGame('主角');
    const prompt = buildChoicePrompt(getOptions(state));
    const elicitation = toMcpElicitationParams(prompt);
    expect(elicitation.mode).toBe('form');
    expect(elicitation.requestedSchema.properties.action.oneOf.length).toBeGreaterThan(0);
    for (const opt of elicitation.requestedSchema.properties.action.oneOf) {
      expect(typeof opt.const).toBe('string');
      expect(typeof opt.title).toBe('string');
    }
  });

  it('fromElicitationResponse extracts action', () => {
    expect(fromElicitationResponse({ action: 'talk_村长' })).toBe('talk_村长');
    expect(fromElicitationResponse({})).toBeNull();
  });

  it('resolveOption works with elicitation action id', () => {
    const state = createNewGame('主角');
    const prompt = buildChoicePrompt(getOptions(state));
    const first = prompt.choices.find((c) => c.category !== 'nav');
    expect(first).toBeDefined();
    const optionId = fromElicitationResponse({ action: first!.value });
    const resolved = resolveOption(state, optionId!);
    expect(resolved.action).not.toBe('unknown');
  });

  it('paginates when many choices', () => {
    const items = optionsToChoiceItems(
      Array.from({ length: 12 }, (_, i) => ({
        id: `opt_${i}`,
        label: `选项${i}`,
        category: 'shop' as const,
      })),
    );
    const page0 = paginateChoiceItems(items, 0, CHOICES_PER_PAGE);
    expect(page0.choices.some((c) => c.value === '__page_1')).toBe(true);
    const page1 = paginateChoiceItems(items, 1, CHOICES_PER_PAGE);
    expect(page1.choices.some((c) => c.value === '__page_0')).toBe(true);
  });

  it('dialog choice value roundtrips', () => {
    const value = dialogChoiceValue('village_elder', 0);
    expect(parseDialogChoiceValue(value)).toEqual({ dialogId: 'village_elder', index: 0 });
  });

  it('toFeishuInteractiveCard produces action rows', () => {
    const state = createNewGame('主角');
    const card = toFeishuInteractiveCard(buildChoicePrompt(getOptions(state)));
    expect(card.config.wide_screen_mode).toBe(true);
    expect(card.elements.length).toBeGreaterThan(0);
    expect(card.elements[0]?.tag).toBe('action');
  });

  it('pagination resolve returns new prompt', () => {
    const state = createNewGame('主角');
    const many = buildChoicePrompt(
      Array.from({ length: 20 }, (_, i) => ({
        id: `buy_item${i}`,
        label: `购买物品${i}`,
        category: 'shop' as const,
      })),
    );
    expect(many.hasMore).toBe(true);
    const resolved = resolveOption(state, '__page_1');
    expect(resolved.action).toBe('paginate');
    expect(
      resolved.result && typeof resolved.result === 'object' && 'type' in resolved.result,
    ).toBe(true);
  });

  it('parseDialogChoiceValue rejects malformed values', () => {
    expect(parseDialogChoiceValue('dialog:only')).toBeNull();
    expect(parseDialogChoiceValue('dialog:a:bad')).toBeNull();
    expect(parseDialogChoiceValue('move_平安镇')).toBeNull();
  });

  it('parsePaginationValue handles nav tokens', () => {
    expect(isPaginationValue('__page_2')).toBe(true);
    expect(parsePaginationValue('__page_2')).toBe(2);
    expect(parsePaginationValue('talk_村长')).toBeNull();
    expect(parsePaginationValue('__page_x')).toBeNull();
  });

  it('buildChoicePrompt uses dialog branch when dialogChoices provided', () => {
    const prompt = buildChoicePrompt([], {
      dialogChoices: [{ text: '接受', nextId: '', index: 0 }],
      dialogId: 'village_quest',
    });
    expect(prompt.choices[0]?.value).toBe('dialog:village_quest:0');
  });

  it('feishu helpers roundtrip optionId', () => {
    const state = createNewGame('主角');
    const card = toFeishuInteractiveCard(buildChoicePrompt(getOptions(state)));
    const json = feishuCardToMessageContent(card);
    expect(json).toContain('optionId');
    const firstRow = card.elements[0] as { actions?: Array<{ value?: unknown }> };
    const firstBtn = firstRow.actions?.[0];
    expect(parseFeishuButtonValue(firstBtn?.value)).toBeTruthy();
    expect(parseFeishuButtonValue(null)).toBeNull();
  });

  it('paginateChoiceItems clamps page bounds', () => {
    const items = optionsToChoiceItems([
      { id: 'a', label: 'A', category: 'shop' },
      { id: 'b', label: 'B', category: 'shop' },
    ]);
    const lastPage = paginateChoiceItems(items, 99, 1);
    expect(lastPage.page).toBe(1);
    expect(lastPage.choices.some((c) => c.label === '上一页')).toBe(true);
  });
});
