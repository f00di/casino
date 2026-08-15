import { randomInt } from 'node:crypto';
import { applyBlackjackAction, applyPokerAction, createBlackjackState, createPokerState, legalPokerActions, placeBlackjackBet, decideInsurance, startNextBlackjackRound, startNextPokerHand, type BlackjackState, type PokerState } from '@friendly-card-room/game-engine';
import { blackjackSettingsSchema, ErrorCode, pokerSettingsSchema, roomSettingsSchema, type ActionResult, type CreateRoomInput, type JoinResult, type JoinRoomInput, type RoomSnapshot } from '@friendly-card-room/shared';
import type { Config } from './config.js';
import type { RuntimePlayer, RuntimeRoom } from './models.js';
import type { RoomRepository } from './repository.js';
import { generateReconnectToken, generateRoomCode, hashPassword, hashReconnectToken, passwordMatches, reconnectTokenMatches, secureId } from './security.js';
import { buildPlayerView, buildRoomSnapshot, type PlayerGameView } from './views.js';

type ChangeListener = (room: RuntimeRoom) => void;
type ErrorWithCode = Error & { code?: string };

export class RoomManager {
  readonly #rooms = new Map<string, RuntimeRoom>();
  readonly #codes = new Map<string, string>();
  readonly #queues = new Map<string, Promise<unknown>>();
  readonly #timers = new Map<string, NodeJS.Timeout>();
  readonly #hostTimers = new Map<string, NodeJS.Timeout>();
  readonly #nextTimers = new Map<string, NodeJS.Timeout>();
  readonly #expiryTimers = new Map<string, NodeJS.Timeout>();
  #listener: ChangeListener = () => undefined;

  public constructor(readonly repository: RoomRepository, readonly config: Config) {}

  public onChange(listener: ChangeListener): void { this.#listener = listener; }

  public async recover(): Promise<number> {
    const rooms = await this.repository.loadActiveRooms(Date.now());
    for (const room of rooms) {
      this.#rooms.set(room.id, room); this.#codes.set(room.code, room.id);
      await this.#resolveExpired(room);
      this.#scheduleTurn(room); this.#scheduleExpiry(room);
    }
    return rooms.length;
  }

  public getRoom(roomId: string): RuntimeRoom | undefined { return this.#rooms.get(roomId); }
  public findByCode(code: string): RuntimeRoom | undefined { const id = this.#codes.get(code); return id === undefined ? undefined : this.#rooms.get(id); }
  public roomSnapshot(roomId: string): RoomSnapshot | undefined { const room = this.#rooms.get(roomId); return room === undefined ? undefined : buildRoomSnapshot(room); }
  public playerView(roomId: string, playerId: string): PlayerGameView | undefined { const room = this.#rooms.get(roomId); return room === undefined ? undefined : buildPlayerView(room, playerId); }

  public async create(input: CreateRoomInput, socketId: string): Promise<JoinResult> {
    const parsedSettings = roomSettingsSchema.parse(input.settings);
    const now = Date.now();
    let code = generateRoomCode();
    while (this.#codes.has(code)) code = generateRoomCode();
    const id = secureId();
    const playerId = secureId();
    const reconnectToken = generateReconnectToken();
    const player: RuntimePlayer = {
      id: playerId, displayName: input.displayName.trim(), normalizedDisplayName: input.displayName.trim().toLocaleLowerCase('en-US'),
      seatIndex: 0, reconnectTokenHash: hashReconnectToken(reconnectToken, this.config.tokenPepper), ready: false,
      connected: true, balance: 0, eliminated: false, spectator: false, joinedAt: now, lastSeenAt: now, socketIds: new Set([socketId]),
    };
    const room: RuntimeRoom = {
      id, code, gameType: input.gameType, status: 'lobby', hostPlayerId: playerId, expectedPlayerCount: input.expectedPlayerCount,
      ...(input.password === undefined ? {} : { passwordHash: await hashPassword(input.password) }), settings: parsedSettings,
      stateVersion: 0, players: [player], createdAt: now, updatedAt: now,
      expiresAt: now + this.config.roomTtlHours * 3_600_000, eventSequence: 0,
    };
    this.#rooms.set(id, room); this.#codes.set(code, id);
    await this.repository.saveRoom(room); this.#scheduleExpiry(room);
    return { room: buildRoomSnapshot(room), playerId, reconnectToken };
  }

  public async join(input: JoinRoomInput, socketId: string): Promise<JoinResult> {
    const room = this.findByCode(input.roomCode);
    if (room === undefined) throw this.#error(ErrorCode.ROOM_NOT_FOUND, 'That private room was not found.');
    return this.#enqueue(room.id, async () => {
      if (room.status !== 'lobby' && room.status !== 'starting') throw this.#error(ErrorCode.ROOM_LOCKED, 'This session has already started.');
      if (room.players.length >= room.expectedPlayerCount) throw this.#error(ErrorCode.ROOM_FULL, 'This room is full.');
      if (room.passwordHash !== undefined && (input.password === undefined || !await passwordMatches(input.password, room.passwordHash))) {
        throw this.#error(ErrorCode.INVALID_ROOM_PASSWORD, 'The room password is incorrect.');
      }
      const normalized = input.displayName.trim().toLocaleLowerCase('en-US');
      if (room.players.some((player) => player.normalizedDisplayName === normalized)) throw this.#error(ErrorCode.DISPLAY_NAME_TAKEN, 'That display name is already in use in this room.');
      const reconnectToken = generateReconnectToken();
      const now = Date.now();
      const player: RuntimePlayer = {
        id: secureId(), displayName: input.displayName.trim(), normalizedDisplayName: normalized,
        seatIndex: this.#openSeat(room), reconnectTokenHash: hashReconnectToken(reconnectToken, this.config.tokenPepper),
        ready: false, connected: true, balance: 0, eliminated: false, spectator: false,
        joinedAt: now, lastSeenAt: now, socketIds: new Set([socketId]),
      };
      room.players.push(player); room.stateVersion += 1; this.#touch(room);
      await this.repository.saveRoom(room); this.#listener(room);
      this.#maybeCountdown(room);
      return { room: buildRoomSnapshot(room), playerId: player.id, reconnectToken };
    });
  }

  public async reconnect(roomId: string, playerId: string, token: string, socketId: string): Promise<{ room: RoomSnapshot; game?: PlayerGameView }> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) throw this.#error(ErrorCode.ROOM_NOT_FOUND, 'That room is no longer available.');
    return this.#enqueue(room.id, async () => {
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (player === undefined || !reconnectTokenMatches(token, player.reconnectTokenHash, this.config.tokenPepper)) {
        throw this.#error(ErrorCode.INVALID_RECONNECT_TOKEN, 'Your saved seat could not be verified.');
      }
      player.connected = true; player.lastSeenAt = Date.now(); player.socketIds.add(socketId);
      const hostTimer = this.#hostTimers.get(room.id); if (player.id === room.hostPlayerId && hostTimer !== undefined) { clearTimeout(hostTimer); this.#hostTimers.delete(room.id); }
      await this.repository.saveRoom(room); this.#listener(room);
      const game = buildPlayerView(room, playerId);
      return { room: buildRoomSnapshot(room), ...(game === undefined ? {} : { game }) };
    });
  }

  public async disconnect(socketId: string): Promise<void> {
    for (const room of this.#rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketIds.has(socketId));
      if (player === undefined) continue;
      player.socketIds.delete(socketId);
      if (player.socketIds.size === 0) { player.connected = false; player.lastSeenAt = Date.now(); }
      await this.repository.saveRoom(room); this.#listener(room);
      if (player.id === room.hostPlayerId && !player.connected) this.#scheduleHostTransfer(room);
    }
  }

  public async setReady(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, ready: boolean): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'room:setReady', { ready }, (room, player) => {
      if (room.status !== 'lobby' && room.status !== 'starting') throw this.#error(ErrorCode.ROOM_LOCKED, 'Ready state is locked after start.');
      player.ready = ready;
    });
  }

  public async updateSettings(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, settings: RuntimeRoom['settings']): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'room:updateSettings', {}, (room) => {
      if (room.hostPlayerId !== playerId) throw this.#error(ErrorCode.NOT_ROOM_HOST, 'Only the host can update room settings.');
      if (room.status !== 'lobby') throw this.#error(ErrorCode.ROOM_LOCKED, 'Settings are locked once starting begins.');
      room.settings = roomSettingsSchema.parse(settings);
    });
  }

  public async leave(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, permanent: boolean): Promise<ActionResult> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return this.#failure(ErrorCode.ROOM_NOT_FOUND, 'Room not found.', 0);
    return this.#enqueue(roomId, async () => {
      const processed = await this.repository.getProcessedAction(roomId, playerId, clientActionId);
      if (processed !== undefined) return { ...processed, code: ErrorCode.ACTION_ALREADY_PROCESSED, message: 'This leave action was already processed.' };
      if (room.stateVersion !== expectedVersion) return this.#failure(ErrorCode.STATE_VERSION_CONFLICT, 'Room state changed; try again.', room.stateVersion);
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (player === undefined) return this.#failure(ErrorCode.INVALID_RECONNECT_TOKEN, 'Player session not found.', room.stateVersion);
      if (!permanent) { player.connected = false; player.socketIds.clear(); await this.repository.saveRoom(room); this.#listener(room); return { ok: true, message: 'Disconnected. Your seat can be reclaimed.', stateVersion: room.stateVersion }; }
      if (room.status !== 'lobby') return this.#failure(ErrorCode.ROOM_LOCKED, 'You cannot permanently leave after the session starts.', room.stateVersion);
      room.players = room.players.filter((candidate) => candidate.id !== playerId);
      if (room.hostPlayerId === playerId && room.players.length > 0) room.hostPlayerId = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? '';
      if (room.players.length === 0) room.status = 'expired';
      room.stateVersion += 1; room.eventSequence += 1; this.#touch(room);
      const result: ActionResult = { ok: true, message: 'You permanently left the room and the reconnect token was removed.', stateVersion: room.stateVersion };
      await this.repository.removePlayer(room, playerId, { roomId, playerId, clientActionId, stateVersion: room.stateVersion,
        actionType: 'room:leave', sanitizedPayload: { permanent: true }, result });
      this.#listener(room);
      return result;
    });
  }

  public async start(roomId: string, playerId: string, clientActionId: string, expectedVersion: number): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'room:start', {}, (room) => {
      if (room.hostPlayerId !== playerId) throw this.#error(ErrorCode.NOT_ROOM_HOST, 'Only the host can start this session.');
      if (room.status === 'active') throw this.#error(ErrorCode.GAME_ALREADY_STARTED, 'The game is already active.');
      if (room.players.length !== room.expectedPlayerCount || room.players.some((player) => !player.ready)) throw this.#error(ErrorCode.PLAYER_NOT_READY, 'Every expected player must join and be ready.');
      this.#startGame(room);
    });
  }

  public async pokerAction(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, action: Parameters<typeof applyPokerAction>[2]): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, `poker:${action.type}`, {}, (room, player) => {
      if (room.gameType !== 'poker' || room.status !== 'active' || room.game === undefined) throw this.#error(ErrorCode.INVALID_ACTION, 'Poker is not active.');
      if (room.game.currentPlayerId !== player.id) throw this.#error(ErrorCode.NOT_YOUR_TURN, 'It is not your turn.');
      const game = room.game as PokerState;
      applyPokerAction(game, player.id, action);
      this.#syncBalances(room);
      if (game.street === 'complete' && room.players.filter((candidate) => candidate.balance > 0).length === 1) room.status = 'completed';
      else if (game.street === 'complete') this.#scheduleNextPokerHand(room);
      this.#setTurnDeadline(room);
    });
  }

  public async nextPokerHand(roomId: string, playerId: string, clientActionId: string, expectedVersion: number): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'poker:nextHand', {}, (room) => {
      if (room.hostPlayerId !== playerId) throw this.#error(ErrorCode.NOT_ROOM_HOST, 'Only the host can advance a paused table.');
      if (room.gameType !== 'poker' || room.game === undefined) throw this.#error(ErrorCode.INVALID_ACTION, 'Poker is not active.');
      room.game = startNextPokerHand(room.game as PokerState); delete room.countdownEndsAt;
      const timer = this.#nextTimers.get(room.id); if (timer !== undefined) clearTimeout(timer); this.#nextTimers.delete(room.id);
      this.#syncBalances(room); this.#setTurnDeadline(room);
    });
  }

  public async blackjackBet(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, amount: number, sitOut: boolean): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'blackjack:bet', { amount, sitOut }, (room) => {
      if (room.gameType !== 'blackjack' || room.game === undefined) throw this.#error(ErrorCode.INVALID_ACTION, 'Blackjack is not active.');
      placeBlackjackBet(room.game as BlackjackState, playerId, amount, sitOut); this.#syncBalances(room); this.#setTurnDeadline(room);
    });
  }

  public async blackjackInsurance(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, take: boolean, amount: number): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'blackjack:insurance', { take }, (room) => {
      if (room.gameType !== 'blackjack' || room.game === undefined) throw this.#error(ErrorCode.INVALID_ACTION, 'Blackjack is not active.');
      decideInsurance(room.game as BlackjackState, playerId, take ? amount : 0); this.#syncBalances(room); this.#setTurnDeadline(room);
    });
  }

  public async blackjackAction(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, action: Parameters<typeof applyBlackjackAction>[2]): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, `blackjack:${action}`, {}, (room) => {
      if (room.gameType !== 'blackjack' || room.game === undefined) throw this.#error(ErrorCode.INVALID_ACTION, 'Blackjack is not active.');
      applyBlackjackAction(room.game as BlackjackState, playerId, action); this.#syncBalances(room); this.#setTurnDeadline(room);
    });
  }

  public async nextBlackjackRound(roomId: string, playerId: string, clientActionId: string, expectedVersion: number): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'blackjack:nextRound', {}, (room) => {
      if (room.hostPlayerId !== playerId) throw this.#error(ErrorCode.NOT_ROOM_HOST, 'Only the host can advance the round.');
      if (room.gameType !== 'blackjack' || room.game === undefined || (room.game as BlackjackState).phase !== 'settled') throw this.#error(ErrorCode.INVALID_ACTION, 'The round is not settled.');
      startNextBlackjackRound(room.game as BlackjackState); this.#syncBalances(room); this.#setTurnDeadline(room);
    });
  }

  public async endSession(roomId: string, playerId: string, clientActionId: string, expectedVersion: number): Promise<ActionResult> {
    return this.#action(roomId, playerId, clientActionId, expectedVersion, 'session:end', {}, (room) => {
      if (room.hostPlayerId !== playerId) throw this.#error(ErrorCode.NOT_ROOM_HOST, 'Only the host can end the session.');
      room.status = 'completed'; delete room.turnDeadline; delete room.countdownEndsAt; this.#clearTurn(room.id);
    });
  }

  public sessionAudit(roomId: string, playerId: string, token: string): Promise<unknown[]> {
    const room = this.#rooms.get(roomId); const player = room?.players.find((candidate) => candidate.id === playerId);
    if (room === undefined) return Promise.reject(this.#error(ErrorCode.ROOM_NOT_FOUND, 'Room not found.'));
    if (player === undefined || !reconnectTokenMatches(token, player.reconnectTokenHash, this.config.tokenPepper)) return Promise.reject(this.#error(ErrorCode.INVALID_RECONNECT_TOKEN, 'Player session could not be verified.'));
    if (room.status !== 'completed') return Promise.reject(this.#error(ErrorCode.INVALID_ACTION, 'Audit data is revealed only after the session completes.'));
    return this.repository.revealAudits(roomId);
  }

  public verifyMembership(roomId: string, playerId: string, socketId: string): RuntimePlayer | undefined {
    return this.#rooms.get(roomId)?.players.find((player) => player.id === playerId && player.socketIds.has(socketId));
  }

  async #action(roomId: string, playerId: string, clientActionId: string, expectedVersion: number, actionType: string, payload: Record<string, unknown>, mutate: (room: RuntimeRoom, player: RuntimePlayer) => void): Promise<ActionResult> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return this.#failure(ErrorCode.ROOM_NOT_FOUND, 'Room not found.', 0);
    return this.#enqueue(roomId, async () => {
      const processed = await this.repository.getProcessedAction(roomId, playerId, clientActionId);
      if (processed !== undefined) return { ...processed, code: ErrorCode.ACTION_ALREADY_PROCESSED, message: 'This action was already processed.' };
      if (room.stateVersion !== expectedVersion) return this.#failure(ErrorCode.STATE_VERSION_CONFLICT, 'Game state changed; a fresh snapshot was sent.', room.stateVersion);
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (player === undefined) return this.#failure(ErrorCode.INVALID_RECONNECT_TOKEN, 'Player session not found.', room.stateVersion);
      try { mutate(room, player); } catch (error) { return this.#fromError(error, room.stateVersion); }
      room.stateVersion += 1; room.eventSequence += 1; this.#touch(room);
      const result: ActionResult = { ok: true, message: 'Action accepted.', stateVersion: room.stateVersion };
      await this.repository.saveAction(room, { roomId, playerId, clientActionId, stateVersion: room.stateVersion, actionType, sanitizedPayload: payload, result });
      this.#listener(room); if (actionType === 'room:setReady') this.#maybeCountdown(room); return result;
    });
  }

  #startGame(room: RuntimeRoom): void {
    room.status = 'active'; delete room.countdownEndsAt;
    if (room.gameType === 'poker') {
      const settings = pokerSettingsSchema.parse(room.settings.poker ?? {});
      for (const player of room.players) player.balance = settings.startingBalance;
      const dealer = room.players[randomInt(0, room.players.length)]?.seatIndex ?? 0;
      room.game = createPokerState(room.players.map((player) => ({ id: player.id, seatIndex: player.seatIndex, stack: player.balance })),
        { smallBlind: settings.smallBlind, bigBlind: settings.bigBlind }, dealer);
    } else {
      const settings = blackjackSettingsSchema.parse(room.settings.blackjack ?? {});
      for (const player of room.players) player.balance = settings.startingBalance;
      room.game = createBlackjackState(room.players.map((player) => ({ id: player.id, seatIndex: player.seatIndex, balance: player.balance })), settings);
    }
    this.#syncBalances(room); this.#setTurnDeadline(room);
  }

  #syncBalances(room: RuntimeRoom): void {
    if (room.game === undefined) return;
    for (const player of room.players) {
      const gamePlayer = room.game.players.find((candidate) => candidate.id === player.id);
      if (gamePlayer === undefined) continue;
      player.balance = 'stack' in gamePlayer ? gamePlayer.stack : gamePlayer.balance;
      player.eliminated = 'eliminated' in gamePlayer ? gamePlayer.eliminated : false;
      player.spectator = 'spectator' in gamePlayer ? gamePlayer.spectator : false;
    }
  }

  #setTurnDeadline(room: RuntimeRoom): void {
    if (room.game === undefined || !('currentPlayerId' in room.game) || room.game.currentPlayerId === undefined) { delete room.turnDeadline; this.#clearTurn(room.id); return; }
    room.turnDeadline = Date.now() + room.settings.turnSeconds * 1000; this.#scheduleTurn(room);
  }

  #scheduleTurn(room: RuntimeRoom): void {
    this.#clearTurn(room.id);
    if (room.turnDeadline === undefined) return;
    const timer = setTimeout(() => { void this.#resolveExpired(room); }, Math.max(0, room.turnDeadline - Date.now()));
    timer.unref(); this.#timers.set(room.id, timer);
  }

  async #resolveExpired(room: RuntimeRoom): Promise<void> {
    if (room.turnDeadline === undefined || room.turnDeadline > Date.now() || room.game === undefined) return;
    await this.#enqueue(room.id, async () => {
      if (room.turnDeadline === undefined || room.turnDeadline > Date.now() || room.game === undefined) return;
      const playerId = room.game.currentPlayerId;
      if (playerId === undefined) return;
      if (room.gameType === 'poker') {
        const game = room.game as PokerState;
        const legal = legalPokerActions(game, playerId);
        applyPokerAction(game, playerId, legal.check ? { type: 'check' } : { type: 'fold' });
      } else applyBlackjackAction(room.game as BlackjackState, playerId, 'stand');
      this.#syncBalances(room); room.stateVersion += 1; room.eventSequence += 1; this.#touch(room); this.#setTurnDeadline(room);
      const result: ActionResult = { ok: true, code: ErrorCode.TURN_EXPIRED, message: 'Turn timer expired; the server applied the default action.', stateVersion: room.stateVersion };
      await this.repository.saveAction(room, { roomId: room.id, playerId, clientActionId: secureId(), stateVersion: room.stateVersion, actionType: 'timer:expired', sanitizedPayload: {}, result });
      this.#listener(room);
    });
  }

  #maybeCountdown(room: RuntimeRoom): void {
    const ready = room.players.length === room.expectedPlayerCount && room.players.every((player) => player.ready);
    if (!room.settings.autoStart || !ready || room.status === 'active' || room.countdownEndsAt !== undefined) return;
    room.status = 'starting'; room.countdownEndsAt = Date.now() + 5000; this.#listener(room);
    const timer = setTimeout(() => { void this.start(room.id, room.hostPlayerId, secureId(), room.stateVersion); }, 5000);
    timer.unref();
  }

  #scheduleHostTransfer(room: RuntimeRoom): void {
    const previous = this.#hostTimers.get(room.id); if (previous !== undefined) clearTimeout(previous);
    const timer = setTimeout(() => {
      void this.#enqueue(room.id, async () => {
        const host = room.players.find((player) => player.id === room.hostPlayerId);
        if (host?.connected) return;
        const successor = room.players.filter((player) => player.connected && !player.eliminated).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (successor === undefined) return;
        room.hostPlayerId = successor.id; room.stateVersion += 1; this.#touch(room); await this.repository.saveRoom(room); this.#listener(room);
      });
    }, room.settings.hostGraceSeconds * 1000);
    timer.unref(); this.#hostTimers.set(room.id, timer);
  }

  #scheduleNextPokerHand(room: RuntimeRoom): void {
    const settings = pokerSettingsSchema.parse(room.settings.poker ?? {});
    if (settings.pauseBetweenHands || room.status !== 'active' || room.countdownEndsAt !== undefined) return;
    room.countdownEndsAt = Date.now() + 5000;
    const timer = setTimeout(() => { void this.nextPokerHand(room.id, room.hostPlayerId, secureId(), room.stateVersion); }, 5000);
    timer.unref(); this.#nextTimers.set(room.id, timer);
  }

  #scheduleExpiry(room: RuntimeRoom): void {
    const existing = this.#expiryTimers.get(room.id); if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.#enqueue(room.id, async () => {
        if (room.expiresAt > Date.now()) { this.#scheduleExpiry(room); return; }
        if (room.players.some((player) => player.connected)) {
          room.expiresAt = Date.now() + this.config.roomTtlHours * 3_600_000; this.#scheduleExpiry(room); return;
        }
        room.status = 'expired'; room.stateVersion += 1; this.#touch(room, false);
        await this.repository.saveRoom(room); this.#listener(room);
      });
    }, Math.max(1, room.expiresAt - Date.now()));
    timer.unref(); this.#expiryTimers.set(room.id, timer);
  }

  #openSeat(room: RuntimeRoom): number { const used = new Set(room.players.map((player) => player.seatIndex)); for (let seat = 0; seat < 9; seat += 1) if (!used.has(seat)) return seat; throw new Error('No open seat.'); }
  #touch(room: RuntimeRoom, extendExpiry = true): void {
    room.updatedAt = Date.now();
    if (extendExpiry) { room.expiresAt = room.updatedAt + this.config.roomTtlHours * 3_600_000; this.#scheduleExpiry(room); }
  }
  #clearTurn(roomId: string): void { const timer = this.#timers.get(roomId); if (timer !== undefined) clearTimeout(timer); this.#timers.delete(roomId); }
  #error(code: string, message: string): ErrorWithCode { return Object.assign(new Error(message), { code }); }
  #failure(code: string, message: string, stateVersion: number): ActionResult { return { ok: false, code: code as NonNullable<ActionResult['code']>, message, stateVersion }; }
  #fromError(error: unknown, version: number): ActionResult {
    const value = error as ErrorWithCode; const code = value.code ?? value.message;
    return this.#failure(Object.values(ErrorCode).includes(code as never) ? code : ErrorCode.INVALID_ACTION, value.message || 'Action rejected.', version);
  }
  #enqueue<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(roomId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const tracked = next.then(() => undefined, () => undefined).finally(() => { if (this.#queues.get(roomId) === tracked) this.#queues.delete(roomId); });
    this.#queues.set(roomId, tracked);
    return next;
  }
}
