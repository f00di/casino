import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, type CreateRoomInput } from '@friendly-card-room/shared';
import type { PokerState } from '@friendly-card-room/game-engine';
import type { Config } from './config.js';
import { MemoryRoomRepository } from './repository.js';
import { RoomManager } from './room-manager.js';

const config: Config = {
  nodeEnv: 'test', port: 3001, clientOrigins: ['http://localhost:5173'], sessionSecret: 'x'.repeat(32),
  tokenPepper: 'p'.repeat(32), roomTtlHours: 24, logLevel: 'silent',
};
const pokerInput: CreateRoomInput = {
  displayName: 'Alex', gameType: 'poker', expectedPlayerCount: 2,
  settings: { turnSeconds: 30, hostGraceSeconds: 5, autoStart: false, poker: { startingBalance: 10_000, smallBlind: 50, bigBlind: 100, timedBlindMinutes: 0, pauseBetweenHands: false } },
};

describe('room manager integration', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; });
  afterEach(() => { delete process.env.NODE_ENV; vi.useRealTimers(); });

  it('creates, joins, readies, locks, and assigns exactly equal starting stacks', async () => {
    const repository = new MemoryRoomRepository(); const manager = new RoomManager(repository, config);
    const host = await manager.create(pokerInput, 'socket-a');
    const friend = await manager.join({ displayName: 'Blair', roomCode: host.room.roomCode }, 'socket-b');
    await manager.setReady(host.room.roomId, host.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1, true);
    await manager.setReady(host.room.roomId, friend.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1, true);
    const version = manager.getRoom(host.room.roomId)?.stateVersion ?? -1;
    const result = await manager.start(host.room.roomId, host.playerId, crypto.randomUUID(), version);
    expect(result.ok).toBe(true);
    const room = manager.getRoom(host.room.roomId);
    expect(room?.status).toBe('active');
    expect(room?.players.map((player) => player.balance).sort((a, b) => a - b)).toEqual([9900, 9950]); // blinds posted from equal 10,000 stacks
    expect((room?.game as PokerState | undefined)?.players.map((player) => player.stack + player.totalContribution)).toEqual([10_000, 10_000]);
    await expect(manager.join({ displayName: 'Casey', roomCode: host.room.roomCode }, 'socket-c')).rejects.toMatchObject({ code: ErrorCode.ROOM_LOCKED });
  });

  it('rejects wrong passwords, duplicate names case-insensitively, and room overflow', async () => {
    const manager = new RoomManager(new MemoryRoomRepository(), config);
    const host = await manager.create({ ...pokerInput, password: 'friend-pass' }, 'a');
    await expect(manager.join({ displayName: 'Blair', roomCode: host.room.roomCode, password: 'wrong' }, 'b')).rejects.toMatchObject({ code: ErrorCode.INVALID_ROOM_PASSWORD });
    await expect(manager.join({ displayName: 'aLeX', roomCode: host.room.roomCode, password: 'friend-pass' }, 'b')).rejects.toMatchObject({ code: ErrorCode.DISPLAY_NAME_TAKEN });
    await manager.join({ displayName: 'Blair', roomCode: host.room.roomCode, password: 'friend-pass' }, 'b');
    await expect(manager.join({ displayName: 'Casey', roomCode: host.room.roomCode, password: 'friend-pass' }, 'c')).rejects.toMatchObject({ code: ErrorCode.ROOM_FULL });
  });

  it('requires all ready and only allows the host to start', async () => {
    const manager = new RoomManager(new MemoryRoomRepository(), config);
    const host = await manager.create(pokerInput, 'a');
    const friend = await manager.join({ displayName: 'Blair', roomCode: host.room.roomCode }, 'b');
    const version = manager.getRoom(host.room.roomId)?.stateVersion ?? -1;
    expect((await manager.start(host.room.roomId, friend.playerId, crypto.randomUUID(), version)).code).toBe(ErrorCode.NOT_ROOM_HOST);
    expect((await manager.start(host.room.roomId, host.playerId, crypto.randomUUID(), version)).code).toBe(ErrorCode.PLAYER_NOT_READY);
  });

  it('reconnects only with the correct token and preserves the seat', async () => {
    const manager = new RoomManager(new MemoryRoomRepository(), config);
    const host = await manager.create(pokerInput, 'a');
    await manager.disconnect('a');
    await expect(manager.reconnect(host.room.roomId, host.playerId, 'invalid-token-that-is-at-least-32-characters', 'b')).rejects.toMatchObject({ code: ErrorCode.INVALID_RECONNECT_TOKEN });
    const restored = await manager.reconnect(host.room.roomId, host.playerId, host.reconnectToken, 'b');
    expect(restored.room.players[0]?.seatIndex).toBe(0);
    expect(restored.room.players[0]?.connected).toBe(true);
  });

  it('allows only the host to update lobby settings and permanently removes a leaving seat', async () => {
    const repository = new MemoryRoomRepository(); const manager = new RoomManager(repository, config);
    const host = await manager.create(pokerInput, 'a');
    const friend = await manager.join({ displayName: 'Blair', roomCode: host.room.roomCode }, 'b');
    const rejected = await manager.updateSettings(host.room.roomId, friend.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1,
      { ...pokerInput.settings, turnSeconds: 45 });
    expect(rejected.code).toBe(ErrorCode.NOT_ROOM_HOST);
    const updated = await manager.updateSettings(host.room.roomId, host.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1,
      { ...pokerInput.settings, turnSeconds: 45 });
    expect(updated.ok).toBe(true); expect(manager.getRoom(host.room.roomId)?.settings.turnSeconds).toBe(45);
    const leaveId = crypto.randomUUID(); const leaveVersion = manager.getRoom(host.room.roomId)?.stateVersion ?? -1;
    const left = await manager.leave(host.room.roomId, friend.playerId, leaveId, leaveVersion, true);
    expect(left.ok).toBe(true); expect(manager.getRoom(host.room.roomId)?.players.map((player) => player.id)).toEqual([host.playerId]);
    const duplicate = await manager.leave(host.room.roomId, friend.playerId, leaveId, leaveVersion, true);
    expect(duplicate.code).toBe(ErrorCode.ACTION_ALREADY_PROCESSED);
    await expect(manager.reconnect(host.room.roomId, friend.playerId, friend.reconnectToken, 'new-b')).rejects.toMatchObject({ code: ErrorCode.INVALID_RECONNECT_TOKEN });
  });

  it('rejects version conflicts and applies duplicate action IDs only once', async () => {
    const repository = new MemoryRoomRepository(); const manager = new RoomManager(repository, config);
    const host = await manager.create(pokerInput, 'a');
    const friend = await manager.join({ displayName: 'Blair', roomCode: host.room.roomCode }, 'b');
    await manager.setReady(host.room.roomId, host.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1, true);
    await manager.setReady(host.room.roomId, friend.playerId, crypto.randomUUID(), manager.getRoom(host.room.roomId)?.stateVersion ?? -1, true);
    const version = manager.getRoom(host.room.roomId)?.stateVersion ?? -1;
    await manager.start(host.room.roomId, host.playerId, crypto.randomUUID(), version);
    const active = manager.getRoom(host.room.roomId); const gameVersion = active?.stateVersion ?? -1;
    const current = active?.game?.currentPlayerId;
    if (current === undefined) throw new Error('Expected current player.');
    const stale = await manager.pokerAction(host.room.roomId, current, crypto.randomUUID(), gameVersion - 1, { type: 'fold' });
    expect(stale.code).toBe(ErrorCode.STATE_VERSION_CONFLICT);
    const actionId = crypto.randomUUID();
    const first = await manager.pokerAction(host.room.roomId, current, actionId, gameVersion, { type: 'fold' });
    const duplicate = await manager.pokerAction(host.room.roomId, current, actionId, gameVersion, { type: 'fold' });
    expect(first.ok).toBe(true); expect(duplicate.code).toBe(ErrorCode.ACTION_ALREADY_PROCESSED);
    expect(manager.getRoom(host.room.roomId)?.stateVersion).toBe(gameVersion + 1);
  });

  it('expires an abandoned room after the configured TTL', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-14T00:00:00Z'));
    const manager = new RoomManager(new MemoryRoomRepository(), { ...config, roomTtlHours: 1 });
    const host = await manager.create(pokerInput, 'a'); await manager.disconnect('a');
    await vi.advanceTimersByTimeAsync(3_600_001);
    expect(manager.getRoom(host.room.roomId)?.status).toBe('expired');
  });
});
