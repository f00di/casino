import type { Server, Socket } from 'socket.io';
import { z, type ZodType } from 'zod';
import { blackjackActionSchema, blackjackBetSchema, chatSchema, createRoomSchema, endSessionSchema, insuranceSchema, joinRoomSchema, leaveSchema, nextHandSchema, nextRoundSchema, pokerActionSchema, readySchema, reconnectSchema, startSchema, stateRequestSchema, updateSettingsSchema, ErrorCode, type ActionResult, type ChatMessage } from '@friendly-card-room/shared';
import type { RoomManager } from './room-manager.js';
import { secureId } from './security.js';
import { buildPlayerView, buildRoomSnapshot } from './views.js';

type Ack = (response: unknown) => void;

class SlidingRateLimit {
  readonly #events = new Map<string, number[]>();
  public allows(key: string, limit: number, intervalMs: number): boolean {
    const now = Date.now();
    const recent = (this.#events.get(key) ?? []).filter((timestamp) => timestamp > now - intervalMs);
    if (recent.length >= limit) { this.#events.set(key, recent); return false; }
    recent.push(now); this.#events.set(key, recent); return true;
  }
}

function errorResponse(error: unknown): ActionResult {
  const value = error as Error & { code?: string };
  return { ok: false, code: (value.code as ActionResult['code']) ?? ErrorCode.INTERNAL_ERROR,
    message: value.code === undefined ? 'The server could not complete that request.' : value.message, stateVersion: 0 };
}

function validated<T>(schema: ZodType<T>, handler: (input: T, ack: Ack) => Promise<void> | void): (payload: unknown, ack?: Ack) => void {
  return (payload, ack = () => undefined) => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, code: ErrorCode.VALIDATION_ERROR, message: z.prettifyError(parsed.error), stateVersion: 0 });
      return;
    }
    Promise.resolve(handler(parsed.data, ack)).catch((error: unknown) => { ack(errorResponse(error)); });
  };
}

export function registerSocketHandlers(io: Server, manager: RoomManager, isStopping: () => boolean): void {
  const rate = new SlidingRateLimit();
  manager.onChange((room) => {
    for (const player of room.players) {
      for (const socketId of player.socketIds) {
        io.to(socketId).emit('room:snapshot', buildRoomSnapshot(room));
        const view = buildPlayerView(room, player.id);
        if (view !== undefined) io.to(socketId).emit('game:snapshot', view);
      }
    }
  });

  io.use((_socket, next) => {
    if (isStopping()) next(new Error(ErrorCode.SERVER_RECOVERING)); else next();
  });

  io.on('connection', (socket: Socket) => {
    const limited = (scope: string, limit: number, interval: number, ack: Ack): boolean => {
      if (rate.allows(`${socket.handshake.address}:${scope}`, limit, interval)) return false;
      ack({ ok: false, code: ErrorCode.RATE_LIMITED, message: 'Too many requests. Please wait and try again.', stateVersion: 0 }); return true;
    };

    socket.on('room:create', validated(createRoomSchema, async (input, ack) => {
      if (limited('create', 5, 60_000, ack)) return;
      const result = await manager.create(input, socket.id);
      await socket.join(result.room.roomId); ack({ ok: true, message: 'Private room created.', stateVersion: result.room.stateVersion, data: result });
    }));
    socket.on('room:join', validated(joinRoomSchema, async (input, ack) => {
      if (limited('join', 20, 60_000, ack)) return;
      const result = await manager.join(input, socket.id);
      await socket.join(result.room.roomId); ack({ ok: true, message: 'Joined room.', stateVersion: result.room.stateVersion, data: result });
    }));
    socket.on('room:reconnect', validated(reconnectSchema, async (input, ack) => {
      const result = await manager.reconnect(input.roomId, input.playerId, input.reconnectToken, socket.id);
      await socket.join(input.roomId); ack({ ok: true, message: 'Successfully reconnected.', stateVersion: result.room.stateVersion, data: result });
    }));
    socket.on('room:setReady', validated(readySchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.setReady(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.ready));
    }));
    socket.on('room:updateSettings', validated(updateSettingsSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.updateSettings(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.settings));
    }));
    socket.on('room:leave', validated(leaveSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      const result = await manager.leave(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.permanent);
      if (result.ok) await socket.leave(input.roomId); ack(result);
    }));
    socket.on('room:start', validated(startSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.start(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion));
    }));
    socket.on('state:request', validated(stateRequestSchema, (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      const room = manager.roomSnapshot(input.roomId); const game = manager.playerView(input.roomId, input.playerId);
      ack({ ok: true, message: 'Authoritative snapshot.', stateVersion: room?.stateVersion ?? 0, data: { room, game } });
    }));
    socket.on('poker:action', validated(pokerActionSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      const action = input.action.type === 'bet' ? { type: 'bet' as const, betTo: input.action.betTo }
        : input.action.type === 'raise' ? { type: 'raise' as const, raiseTo: input.action.raiseTo } : input.action;
      const result = await manager.pokerAction(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, action);
      ack(result); if (result.code === ErrorCode.STATE_VERSION_CONFLICT) socket.emit('game:snapshot', manager.playerView(input.roomId, input.playerId));
    }));
    socket.on('blackjack:placeBet', validated(blackjackBetSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.blackjackBet(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.amount, input.sitOut));
    }));
    socket.on('blackjack:insurance', validated(insuranceSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.blackjackInsurance(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.take, input.amount));
    }));
    socket.on('blackjack:action', validated(blackjackActionSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.blackjackAction(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion, input.action.type));
    }));
    socket.on('poker:nextHand', validated(nextHandSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.nextPokerHand(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion));
    }));
    socket.on('blackjack:nextRound', validated(nextRoundSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.nextBlackjackRound(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion));
    }));
    socket.on('session:end', validated(endSessionSchema, async (input, ack) => {
      if (manager.verifyMembership(input.roomId, input.playerId, socket.id) === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      ack(await manager.endSession(input.roomId, input.playerId, input.clientActionId, input.expectedStateVersion));
    }));
    socket.on('room:chat', validated(chatSchema, (input, ack) => {
      const player = manager.verifyMembership(input.roomId, input.playerId, socket.id);
      if (player === undefined) { ack(errorResponse(Object.assign(new Error('Player session not found.'), { code: ErrorCode.INVALID_RECONNECT_TOKEN }))); return; }
      if (limited(`chat:${input.roomId}:${input.playerId}`, 8, 10_000, ack)) return;
      const message: ChatMessage = { id: secureId(), playerId: player.id, displayName: player.displayName, message: input.message, timestamp: Date.now() };
      io.to(input.roomId).emit('room:chat', message);
      ack({ ok: true, message: 'Message sent.', stateVersion: manager.getRoom(input.roomId)?.stateVersion ?? 0 });
    }));
    socket.on('disconnect', () => { void manager.disconnect(socket.id); });
  });
}
