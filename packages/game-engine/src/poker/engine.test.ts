import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerState, legalPokerActions, startNextPokerHand } from './engine.js';
import { riggedDeck } from '../test-helpers.js';

describe('holdem betting engine', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; });
  afterEach(() => { delete process.env.NODE_ENV; });
  const seats = (stacks = [1000, 1000, 1000]) => stacks.map((stack, seatIndex) => ({ id: String.fromCharCode(97 + seatIndex), seatIndex, stack }));

  it('uses correct heads-up blinds and preflop/postflop order', () => {
    const state = createPokerState(seats([1000, 1000]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    expect([state.smallBlindSeat, state.bigBlindSeat, state.currentPlayerId]).toEqual([0, 1, 'a']);
    applyPokerAction(state, 'a', { type: 'call' });
    applyPokerAction(state, 'b', { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.currentPlayerId).toBe('b');
  });

  it('enforces minimum raises and full re-raises', () => {
    const state = createPokerState(seats(), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    expect(() => applyPokerAction(state, 'a', { type: 'raise', raiseTo: 150 })).toThrow('INVALID_RAISE_AMOUNT');
    applyPokerAction(state, 'a', { type: 'raise', raiseTo: 200 });
    expect(state.previousFullRaiseSize).toBe(100);
    applyPokerAction(state, 'b', { type: 'raise', raiseTo: 300 });
    expect(state.currentBet).toBe(300);
  });

  it('allows short all-in without reopening players who already acted', () => {
    const state = createPokerState(seats([1000, 250, 1000]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    applyPokerAction(state, 'a', { type: 'raise', raiseTo: 200 });
    applyPokerAction(state, 'b', { type: 'all-in' }); // only +50, not a full raise
    applyPokerAction(state, 'c', { type: 'call' });
    expect(state.currentPlayerId).toBe('a');
    expect(legalPokerActions(state, 'a').minimumRaiseTo).toBeUndefined();
    expect(legalPokerActions(state, 'a').callAmount).toBe(50);
  });

  it('reopens action when cumulative short all-ins reach a full raise', () => {
    const state = createPokerState([
      { id: 'a', seatIndex: 0, stack: 1000 }, { id: 'd', seatIndex: 1, stack: 1000 },
      { id: 'b', seatIndex: 2, stack: 250 }, { id: 'c', seatIndex: 3, stack: 300 },
    ], { smallBlind: 50, bigBlind: 100 }, 1, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s 7s'));
    applyPokerAction(state, 'a', { type: 'raise', raiseTo: 200 });
    applyPokerAction(state, 'd', { type: 'fold' });
    applyPokerAction(state, 'b', { type: 'all-in' });
    applyPokerAction(state, 'c', { type: 'all-in' });
    expect(state.currentPlayerId).toBe('a');
    expect(legalPokerActions(state, 'a').minimumRaiseTo).toBe(400);
  });

  it('allows a short opening all-in to be completed to the big blind', () => {
    const state = createPokerState(seats([150, 1000]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s 7s'));
    applyPokerAction(state, 'a', { type: 'call' }); applyPokerAction(state, 'b', { type: 'check' });
    applyPokerAction(state, 'b', { type: 'check' }); applyPokerAction(state, 'a', { type: 'all-in' });
    expect(state.currentBet).toBe(50);
    expect(legalPokerActions(state, 'b').minimumRaiseTo).toBe(100);
  });

  it('handles blind all-in and automatic board runout with chip conservation', () => {
    const initial = 550;
    const state = createPokerState(seats([50, 500]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s 7s 6s 5s 4s 3s 2s'));
    expect(state.street).toBe('complete');
    expect(state.communityCards).toHaveLength(5);
    expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(initial);
  });

  it('wins immediately by fold and conserves chips', () => {
    const state = createPokerState(seats([1000, 1000]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js'));
    applyPokerAction(state, 'a', { type: 'fold' });
    expect(state.winnerByFoldId).toBe('b');
    expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(2000);
  });

  it('rotates the dealer and increments the hand number', () => {
    const state = createPokerState(seats([1000, 1000, 1000]), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    applyPokerAction(state, 'a', { type: 'fold' });
    applyPokerAction(state, 'b', { type: 'fold' });
    const next = startNextPokerHand(state, undefined, riggedDeck('Ah Kh Qh Jh Th 9h 8h'));
    expect(next.dealerSeat).toBe(1);
    expect(next.handNumber).toBe(2);
  });

  it('rejects production test-deck injection', () => {
    process.env.NODE_ENV = 'production';
    expect(() => createPokerState(seats(), { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As'))).toThrow('test-only');
  });
});
