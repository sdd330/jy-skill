import { describe, it, expect } from 'vitest';
import {
  calculateDamage,
  calculatePoisonDamage,
  calculateHurtDamage,
  getExpForLevel,
  calculateMpCost,
  calculateStaminaCost,
  calculateMovePoints,
  DEFAULT_ATTRIBUTES,
  MAX_LEVEL,
  MAX_SKILL_LEVEL,
  MAX_STAMINA,
} from './game-logic';

const fixedRandom = (value: number) => () => value;

describe('game-logic', () => {
  describe('calculateDamage', () => {
    it('applies base formula with max random factor', () => {
      expect(calculateDamage(20, 10, 5, 0, 0, fixedRandom(1))).toBe(30);
    });

    it('applies min random factor', () => {
      expect(calculateDamage(20, 10, 5, 0, 0, fixedRandom(0))).toBe(20);
    });

    it('applies ambidextrous multiplier before random', () => {
      const normal = calculateDamage(20, 10, 5, 0, 0, fixedRandom(1));
      const dual = calculateDamage(20, 10, 5, 1, 0, fixedRandom(1));
      expect(dual).toBe(Math.floor(Math.floor(25 * 1.5) * 1.2));
      expect(dual).toBeGreaterThan(normal);
    });

    it('adds martial knowledge bonus', () => {
      expect(calculateDamage(20, 10, 5, 0, 25, fixedRandom(1))).toBe(32);
    });

    it('returns at least 1 damage', () => {
      expect(calculateDamage(5, 0, 100, 0, 0, fixedRandom(0))).toBe(1);
    });
  });

  describe('getExpForLevel', () => {
    it.each([
      [1, 100],
      [2, 150],
      [3, 225],
      [4, 337],
      [5, 506],
      [10, 3844],
    ])('level %i requires %i exp', (level, exp) => {
      expect(getExpForLevel(level)).toBe(exp);
    });
  });

  describe('calculateMpCost', () => {
    it.each([
      [30, 0, 15],
      [30, 1, 30],
      [30, 9, 150],
      [0, 5, 0],
    ])('base %i level %i costs %i mp', (base, level, cost) => {
      expect(calculateMpCost(base, level)).toBe(cost);
    });
  });

  describe('calculateStaminaCost', () => {
    it.each([
      ['normal', 3],
      ['absorbMp', 3],
      ['poison', 2],
      ['depoison', 2],
      ['heal', 4],
      ['unknown', 3],
    ])('damage type %s costs %i stamina', (type, cost) => {
      expect(calculateStaminaCost(type)).toBe(cost);
    });
  });

  describe('calculatePoisonDamage', () => {
    it.each([
      [0, 0],
      [9, 0],
      [10, 1],
      [50, 5],
    ])('poison %i deals %i damage', (poison, damage) => {
      expect(calculatePoisonDamage(poison)).toBe(damage);
    });
  });

  describe('calculateHurtDamage', () => {
    it.each([
      [0, 0],
      [19, 0],
      [20, 1],
      [40, 2],
    ])('hurt %i deals %i damage', (hurt, damage) => {
      expect(calculateHurtDamage(hurt)).toBe(damage);
    });
  });

  describe('calculateMovePoints', () => {
    it.each([
      [0, 3],
      [14, 3],
      [15, 4],
      [30, 5],
    ])('agility %i yields %i move points', (agility, points) => {
      expect(calculateMovePoints(agility)).toBe(points);
    });
  });

  describe('constants', () => {
    it('exports default attributes', () => {
      expect(DEFAULT_ATTRIBUTES.attack).toBe(20);
      expect(DEFAULT_ATTRIBUTES.defence).toBe(10);
      expect(DEFAULT_ATTRIBUTES.maxHp).toBe(100);
    });

    it('exports game limits', () => {
      expect(MAX_LEVEL).toBe(100);
      expect(MAX_SKILL_LEVEL).toBe(10);
      expect(MAX_STAMINA).toBe(100);
    });
  });
});
