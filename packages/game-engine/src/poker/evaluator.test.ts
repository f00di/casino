import { describe, expect, it } from 'vitest';
import { cards } from '../test-helpers.js';
import { compareHands, evaluateBest, evaluateFive } from './evaluator.js';

describe('poker hand evaluator', () => {
  it.each([
    ['As Jd 9h 6c 3s', 'high-card'],
    ['As Ad 9h 6c 3s', 'one-pair'],
    ['As Ad 9h 9c 3s', 'two-pair'],
    ['As Ad Ah 9c 3s', 'three-of-a-kind'],
    ['9s 8d 7h 6c 5s', 'straight'],
    ['As Js 9s 6s 3s', 'flush'],
    ['As Ad Ah 9c 9s', 'full-house'],
    ['As Ad Ah Ac 3s', 'four-of-a-kind'],
    ['9s 8s 7s 6s 5s', 'straight-flush'],
    ['As 2d 3h 4c 5s', 'straight'],
    ['As Kd Qh Jc Ts', 'straight'],
  ])('ranks %s as %s', (input, category) => expect(evaluateFive(cards(input)).category).toBe(category));

  it('compares flush, two-pair, full-house, quads, and straight-flush kickers', () => {
    expect(compareHands(evaluateFive(cards('As Js 9s 6s 3s')), evaluateFive(cards('Ks Qs 9s 6s 3s')))).toBeGreaterThan(0);
    expect(compareHands(evaluateFive(cards('As Ad Kh Kc 2s')), evaluateFive(cards('Qs Qd Jh Jc As')))).toBeGreaterThan(0);
    expect(compareHands(evaluateFive(cards('As Ad Ah Kc Ks')), evaluateFive(cards('Qs Qd Qh Ac As')))).toBeGreaterThan(0);
    expect(compareHands(evaluateFive(cards('As Ad Ah Ac Ks')), evaluateFive(cards('As Ad Ah Ac Qs')))).toBeGreaterThan(0);
    expect(compareHands(evaluateFive(cards('9s 8s 7s 6s 5s')), evaluateFive(cards('8h 7h 6h 5h 4h')))).toBeGreaterThan(0);
  });

  it('selects best five from seven including two triplets and three pairs', () => {
    expect(evaluateBest(cards('As Ad Ah Ks Kd Kh 2s')).score.slice(1)).toEqual([14, 13]);
    expect(evaluateBest(cards('As Ad Ks Kd Qs Qd Jh')).score.slice(1)).toEqual([14, 13, 12]);
    expect(evaluateBest(cards('As Ks Qs Js 9s 8s 2d')).category).toBe('flush');
  });

  it('recognizes board-playing ties', () => {
    const board = cards('As Kd Qh Jc Ts');
    expect(compareHands(evaluateBest([...board, ...cards('2s 3s')]), evaluateBest([...board, ...cards('4d 5d')]))).toBe(0);
  });
});
