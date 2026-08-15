import { describe, expect, it } from 'vitest';
import { cards } from '../test-helpers.js';
import { buildSidePots, settlePots, type PotPlayer } from './pots.js';

describe('poker side pots', () => {
  it('builds layered pots from three all-in sizes and keeps folded dead chips', () => {
    const players: PotPlayer[] = [
      { id: 'a', seatIndex: 0, totalContribution: 100, folded: false },
      { id: 'b', seatIndex: 1, totalContribution: 300, folded: false },
      { id: 'c', seatIndex: 2, totalContribution: 500, folded: false },
      { id: 'd', seatIndex: 3, totalContribution: 500, folded: true },
    ];
    expect(buildSidePots(players)).toEqual([
      { amount: 400, threshold: 100, eligiblePlayerIds: ['a', 'b', 'c'] },
      { amount: 600, threshold: 300, eligiblePlayerIds: ['b', 'c'] },
      { amount: 400, threshold: 500, eligiblePlayerIds: ['c'] },
    ]);
  });

  it('settles independent side pots, split pots, and odd chips clockwise', () => {
    const players: PotPlayer[] = [
      { id: 'a', seatIndex: 1, totalContribution: 5, folded: false, cards: cards('2c 3d') },
      { id: 'b', seatIndex: 2, totalContribution: 5, folded: false, cards: cards('4c 5d') },
      { id: 'dead', seatIndex: 3, totalContribution: 5, folded: true },
    ];
    const awards = settlePots(players, cards('As Ks Qs Js Ts'), 0);
    expect(awards[0]?.amount).toBe(15);
    expect(awards[0]?.awards).toEqual({ a: 8, b: 7 });
    expect(Object.values(awards[0]?.awards ?? {}).reduce((a, b) => a + b, 0)).toBe(15);
  });
});
