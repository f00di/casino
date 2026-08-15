import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createBlackjackState, createPokerState, placeBlackjackBet, startNextPokerHand, type BlackjackState, type PokerState } from '@friendly-card-room/game-engine';
import { riggedDeck, riggedShoe } from '../../../packages/game-engine/src/test-helpers.js';
import type { Config } from './config.js';
import type { RuntimePlayer, RuntimeRoom } from './models.js';
import { MemoryRoomRepository } from './repository.js';
import { RoomManager } from './room-manager.js';

const config: Config = { nodeEnv: 'test', port: 3001, clientOrigins: ['http://localhost:5173'], sessionSecret: 's'.repeat(32), tokenPepper: 'p'.repeat(32), roomTtlHours: 24, logLevel: 'silent' };

function player(id: string, seatIndex: number, balance: number): RuntimePlayer {
  return { id, seatIndex, balance, displayName: id.toUpperCase(), normalizedDisplayName: id, reconnectTokenHash: 'a'.repeat(64), ready: true,
    connected: false, eliminated: false, spectator: false, joinedAt: 1 + seatIndex, lastSeenAt: 1, socketIds: new Set() };
}

function room(gameType: 'poker' | 'blackjack', players: RuntimePlayer[], game: PokerState | BlackjackState): RuntimeRoom {
  return { id: crypto.randomUUID(), code: gameType === 'poker' ? 'ABC234' : 'BCD345', gameType, status: 'active', hostPlayerId: players[0]?.id ?? '',
    expectedPlayerCount: players.length, settings: { turnSeconds: 30, hostGraceSeconds: 30, autoStart: false }, stateVersion: 4,
    players, game, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, expiresAt: Date.now() + 100_000,
    turnDeadline: Date.now() - 1, eventSequence: 4 };
}

describe('deadline and audit recovery', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; });
  afterEach(() => { delete process.env.NODE_ENV; });

  it('resolves an expired poker deadline after restart with check-or-fold', async () => {
    const game = createPokerState([{ id: 'a', seatIndex: 0, stack: 1000 }, { id: 'b', seatIndex: 1, stack: 1000 }],
      { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    const repository = new MemoryRoomRepository(); const value = room('poker', [player('a', 0, 950), player('b', 1, 900)], game);
    await repository.saveRoom(value); const manager = new RoomManager(repository, config); expect(await manager.recover()).toBe(1);
    const recovered = manager.getRoom(value.id)?.game as PokerState;
    expect(recovered.street).toBe('complete'); expect(recovered.players.find((candidate) => candidate.id === 'a')?.folded).toBe(true);
    expect(manager.getRoom(value.id)?.stateVersion).toBe(5);
  });

  it('automatically stands an actionable blackjack hand whose deadline expired offline', async () => {
    const game = createBlackjackState([{ id: 'a', seatIndex: 0, balance: 2000 }],
      { minimumBet: 20, maximumBet: 1000, decks: 1, penetrationPercent: 75, resplitAces: false, splitTenValues: false },
      undefined, riggedShoe('5s 9c 6d 7h 2c'));
    placeBlackjackBet(game, 'a', 20); expect(game.currentPlayerId).toBe('a');
    const repository = new MemoryRoomRepository(); const value = room('blackjack', [player('a', 0, 1980)], game);
    await repository.saveRoom(value); const manager = new RoomManager(repository, config); await manager.recover();
    const recovered = manager.getRoom(value.id)?.game as BlackjackState;
    expect(recovered.phase).toBe('settled'); expect(recovered.players[0]?.hands[0]?.complete).toBe(true);
    expect(manager.getRoom(value.id)?.stateVersion).toBe(5);
  });

  it('retains separate commitment audit records across poker hands', async () => {
    const first = createPokerState([{ id: 'a', seatIndex: 0, stack: 1000 }, { id: 'b', seatIndex: 1, stack: 1000 }],
      { smallBlind: 50, bigBlind: 100 }, 0, 1, undefined, riggedDeck('As Ks Qs Js Ts 9s 8s'));
    applyPokerAction(first, 'a', { type: 'fold' });
    const repository = new MemoryRoomRepository(); const value = room('poker', [player('a', 0, first.players[0]?.stack ?? 0), player('b', 1, first.players[1]?.stack ?? 0)], first);
    await repository.saveAction(value, { roomId: value.id, playerId: 'a', clientActionId: crypto.randomUUID(), stateVersion: 4, actionType: 'poker:fold', sanitizedPayload: {}, result: {} });
    value.game = startNextPokerHand(first, undefined, riggedDeck('Ah Kh Qh Jh Th 9h 8h'));
    await repository.saveAction(value, { roomId: value.id, playerId: 'b', clientActionId: crypto.randomUUID(), stateVersion: 5, actionType: 'poker:nextHand', sanitizedPayload: {}, result: {} });
    const audits = await repository.revealAudits(value.id) as { handOrRoundNumber: number; commitment: string }[];
    expect(audits.map((audit) => audit.handOrRoundNumber)).toEqual([1, 2]);
    expect(new Set(audits.map((audit) => audit.commitment)).size).toBe(2);
  });
});
