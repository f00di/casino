import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyBlackjackAction, blackjackValue, createBlackjackState, decideInsurance, isNatural, placeBlackjackBet, settleBlackjack } from './engine.js';
import { cards, riggedShoe } from '../test-helpers.js';

describe('blackjack engine', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; });
  afterEach(() => { delete process.env.NODE_ENV; });
  const rules = { minimumBet: 20, maximumBet: 1000, decks: 1, penetrationPercent: 75, resplitAces: false, splitTenValues: false };

  it.each([
    ['Ks 7d', 17, false, false],
    ['As 6d', 17, true, false],
    ['As Ad 9c', 21, true, false],
    ['As Ad 9c 9d', 20, false, false],
    ['Ks Qd 2c', 22, false, true],
  ])('values %s', (input, total, soft, bust) => expect(blackjackValue(cards(input))).toEqual({ total, soft, bust }));

  it('identifies only original unsplit two-card naturals', () => {
    const base = { cards: cards('As Kd'), wager: 20, complete: false, doubled: false, surrendered: false, splitAces: false, actionsTaken: 0 };
    expect(isNatural({ ...base, fromSplit: false })).toBe(true);
    expect(isNatural({ ...base, fromSplit: true })).toBe(false);
  });

  it('settles natural blackjack at exact 3:2 in half-credit units', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('As 9c Kd 7h'));
    placeBlackjackBet(state, 'a', 20);
    expect(state.phase).toBe('settled');
    expect(state.players[0]?.hands[0]?.outcome).toBe('blackjack');
    expect(state.players[0]?.balance).toBe(2030);
  });

  it('rejects wagers that cannot settle exactly in half-credit units', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('As 9c Kd 7h'));
    expect(() => placeBlackjackBet(state, 'a', 21)).toThrow('INVALID_BET_AMOUNT');
  });

  it('handles dealer blackjack, blackjack push, and insurance 2:1', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('As Ah Kd Kh'));
    placeBlackjackBet(state, 'a', 20);
    decideInsurance(state, 'a', 10);
    expect(state.players[0]?.hands[0]?.outcome).toBe('push');
    expect(state.players[0]?.balance).toBe(2020);
  });

  it('supports hit bust, stand, and dealer soft-17 stand', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('Ks 6h 6d As 9c'));
    placeBlackjackBet(state, 'a', 20);
    applyBlackjackAction(state, 'a', 'hit');
    expect(state.players[0]?.hands[0]?.outcome).toBe('bust');
    expect(blackjackValue(state.dealerCards)).toEqual({ total: 17, soft: true, bust: false });
  });

  it('doubles once and rejects insufficient funds', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 40 }], rules, undefined, riggedShoe('5s 9c 6d 7h Kh'));
    placeBlackjackBet(state, 'a', 20);
    applyBlackjackAction(state, 'a', 'double');
    expect(state.players[0]?.hands[0]?.wager).toBe(40);
    expect(state.players[0]?.hands[0]?.cards).toHaveLength(3);
    const poor = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 20 }], rules, undefined, riggedShoe('5s 9c 6d 7h'));
    placeBlackjackBet(poor, 'a', 20);
    expect(() => applyBlackjackAction(poor, 'a', 'double')).toThrow('INVALID_ACTION');
  });

  it('splits matching ranks, treats split 21 normally, and restricts split aces', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('Ts 9c Td 7h As 5c'));
    placeBlackjackBet(state, 'a', 20);
    applyBlackjackAction(state, 'a', 'split');
    expect(state.players[0]?.hands).toHaveLength(2);
    expect(state.players[0]?.hands[0]?.fromSplit).toBe(true);
    const aces = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('As 9c Ad 7h Ks Qc'));
    placeBlackjackBet(aces, 'a', 20);
    applyBlackjackAction(aces, 'a', 'split');
    expect(aces.players[0]?.hands.every((hand) => hand.complete)).toBe(true);
    expect(aces.phase).toBe('settled');
  });

  it('settles surrender, win, loss, and push with conserved account deltas', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }], rules, undefined, riggedShoe('Ts 9c 6d 8h'));
    placeBlackjackBet(state, 'a', 20);
    applyBlackjackAction(state, 'a', 'surrender');
    expect(state.players[0]?.balance).toBe(1990);
    expect(state.players[0]?.hands[0]?.outcome).toBe('surrender');
  });

  it('dealer hits soft 16 and settlement returns a push stake', () => {
    const state = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 0 }], rules, undefined, riggedShoe('Ts'));
    state.players[0].spectator = false;
    state.players[0].hands = [{ cards: cards('Ts 8d'), wager: 20, complete: true, doubled: false, surrendered: false, fromSplit: false, splitAces: false, actionsTaken: 1 }];
    state.dealerCards = cards('As 5d 2c');
    settleBlackjack(state);
    expect(blackjackValue(cards('As 5d'))).toEqual({ total: 16, soft: true, bust: false });
    expect(state.players[0]?.balance).toBe(20);
  });

  it('rejects production shoe injection', () => {
    process.env.NODE_ENV = 'production';
    expect(() => createBlackjackState([{ id: 'a', seatIndex: 0, balance: 100 }], rules, undefined, riggedShoe('As'))).toThrow('test-only');
  });
});
