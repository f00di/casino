import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlackjackState, createPokerState } from '@friendly-card-room/game-engine';
import { riggedDeck, riggedShoe } from '../../../packages/game-engine/src/test-helpers.js';
import type { RuntimeRoom } from './models.js';
import { buildPlayerView } from './views.js';

describe('personalized game views', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; });
  afterEach(() => { delete process.env.NODE_ENV; });

  const base = (gameType: 'poker' | 'blackjack'): Omit<RuntimeRoom, 'game'> => ({
    id: 'room', code: 'ABC234', gameType, status: 'active', hostPlayerId: 'a', expectedPlayerCount: 2,
    settings: { turnSeconds: 30, hostGraceSeconds: 30, autoStart: false }, stateVersion: 1, players: [],
    createdAt: 1, updatedAt: 1, expiresAt: 9999999999999, eventSequence: 0,
  });

  it('never leaks other poker hole cards, deck order, nonce, or future board cards', () => {
    const game = createPokerState([{ id: 'a', seatIndex: 0, stack: 1000 }, { id: 'b', seatIndex: 1, stack: 1000 }],
      { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s 7s 6s'));
    const view = buildPlayerView({ ...base('poker'), game }, 'a');
    expect(view?.gameType).toBe('poker');
    if (view?.gameType !== 'poker') throw new Error('Expected poker view.');
    expect(view.players.find((player) => player.id === 'a')?.holeCards).toHaveLength(2);
    expect(view.players.find((player) => player.id === 'b')?.holeCards).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(game.auditNonce);
    expect(Object.hasOwn(view, 'deck')).toBe(false);
    expect(JSON.stringify(view)).not.toContain(game.deck[game.deckCursor]?.physicalId);
  });

  it('hides the dealer hole card and the entire future shoe', () => {
    const game = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }],
      { minimumBet: 20, maximumBet: 1000, decks: 1, penetrationPercent: 75, resplitAces: false, splitTenValues: false },
      undefined, riggedShoe('Ts 9h 7d 8c'));
    game.dealerCards = game.shoe.slice(0, 2); game.shoeCursor = 2; game.dealerHoleRevealed = false;
    const view = buildPlayerView({ ...base('blackjack'), game }, 'a');
    expect(view?.gameType).toBe('blackjack');
    if (view?.gameType !== 'blackjack') throw new Error('Expected blackjack view.');
    expect(view.dealerCards).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(game.dealerCards[1]?.physicalId);
    expect(JSON.stringify(view)).not.toContain(game.auditNonce);
    expect(JSON.stringify(view)).not.toContain('shoe');
  });
});
