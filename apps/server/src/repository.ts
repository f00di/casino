import pg from 'pg';
import type { ActionResult } from '@friendly-card-room/shared';
import type { PersistedAction, RuntimePlayer, RuntimeRoom } from './models.js';

const { Pool } = pg;

export interface RoomRepository {
  saveRoom(room: RuntimeRoom): Promise<void>;
  saveAction(room: RuntimeRoom, action: PersistedAction): Promise<void>;
  getProcessedAction(roomId: string, playerId: string, clientActionId: string): Promise<ActionResult | undefined>;
  loadActiveRooms(now: number): Promise<RuntimeRoom[]>;
  revealAudits(roomId: string): Promise<unknown[]>;
  removePlayer(room: RuntimeRoom, playerId: string, action: PersistedAction): Promise<void>;
  close(): Promise<void>;
}

function gameSnapshot(room: RuntimeRoom): Record<string, unknown> {
  return {
    game: room.game,
    turnDeadline: room.turnDeadline,
    countdownEndsAt: room.countdownEndsAt,
    eventSequence: room.eventSequence,
  };
}

function playerParams(player: RuntimePlayer): unknown[] {
  return [player.id, player.normalizedDisplayName, player.displayName, player.seatIndex,
    player.reconnectTokenHash, player.ready, player.connected, player.balance,
    player.eliminated, player.spectator, new Date(player.joinedAt), new Date(player.lastSeenAt)];
}

export class PostgresRoomRepository implements RoomRepository {
  readonly #pool: pg.Pool;
  public constructor(databaseUrl: string) {
    this.#pool = new Pool({ connectionString: databaseUrl, max: 10, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  }

  public async saveRoom(room: RuntimeRoom): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO rooms (id, room_code, game_type, status, host_player_id, expected_player_count, password_hash, settings, current_state_version, created_at, updated_at, expires_at)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, host_player_id=NULL, expected_player_count=EXCLUDED.expected_player_count,
           settings=EXCLUDED.settings, current_state_version=EXCLUDED.current_state_version, updated_at=EXCLUDED.updated_at, expires_at=EXCLUDED.expires_at`,
        [room.id, room.code, room.gameType, room.status, room.expectedPlayerCount, room.passwordHash ?? null,
          JSON.stringify(room.settings), room.stateVersion, new Date(room.createdAt), new Date(room.updatedAt), new Date(room.expiresAt)],
      );
      for (const player of room.players) {
        await client.query(
          `INSERT INTO players (id, room_id, normalized_display_name, display_name, seat_index, reconnect_token_hash, ready, connected, balance, eliminated, spectator, joined_at, last_seen_at)
           VALUES ($1,$13,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO UPDATE SET reconnect_token_hash=EXCLUDED.reconnect_token_hash, ready=EXCLUDED.ready,
             connected=EXCLUDED.connected, balance=EXCLUDED.balance, eliminated=EXCLUDED.eliminated, spectator=EXCLUDED.spectator, last_seen_at=EXCLUDED.last_seen_at`,
          [...playerParams(player), room.id],
        );
      }
      await client.query('UPDATE rooms SET host_player_id=$2 WHERE id=$1', [room.id, room.hostPlayerId]);
      await client.query(
        `INSERT INTO game_snapshots (room_id, state_version, authoritative_state) VALUES ($1,$2,$3)
         ON CONFLICT (room_id, state_version) DO UPDATE SET authoritative_state=EXCLUDED.authoritative_state`,
        [room.id, room.stateVersion, JSON.stringify(gameSnapshot(room))],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  public async saveAction(room: RuntimeRoom, action: PersistedAction): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [room.id]);
      await client.query('UPDATE rooms SET status=$2, host_player_id=$3, current_state_version=$4, updated_at=$5, settings=$6 WHERE id=$1',
        [room.id, room.status, room.hostPlayerId, room.stateVersion, new Date(room.updatedAt), JSON.stringify(room.settings)]);
      for (const player of room.players) {
        await client.query('UPDATE players SET ready=$2, connected=$3, balance=$4, eliminated=$5, spectator=$6, last_seen_at=$7 WHERE id=$1',
          [player.id, player.ready, player.connected, player.balance, player.eliminated, player.spectator, new Date(player.lastSeenAt)]);
      }
      await client.query('INSERT INTO game_snapshots (room_id,state_version,authoritative_state) VALUES ($1,$2,$3)',
        [room.id, room.stateVersion, JSON.stringify(gameSnapshot(room))]);
      await client.query(
        `INSERT INTO game_events (room_id,state_version,sequence_number,player_id,action_type,sanitized_payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [room.id, room.stateVersion, room.eventSequence, action.playerId, action.actionType, JSON.stringify(action.sanitizedPayload)],
      );
      await client.query(
        `INSERT INTO processed_actions (room_id,player_id,client_action_id,resulting_state_version,result)
         VALUES ($1,$2,$3,$4,$5)`,
        [room.id, action.playerId, action.clientActionId, action.stateVersion, JSON.stringify(action.result)],
      );
      if (room.game !== undefined && ('commitment' in room.game)) {
        const number = 'handNumber' in room.game ? room.game.handNumber : room.game.roundNumber;
        const gameType = 'handNumber' in room.game ? 'poker' : 'blackjack';
        await client.query(
          `INSERT INTO shuffle_audits (room_id,hand_or_round_number,game_type,commitment_hash,nonce,canonical_deck_order,reveal_eligibility)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [room.id, number, gameType, room.game.commitment, room.game.auditNonce, room.game.auditCanonicalOrder, room.status === 'completed'],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  public async getProcessedAction(roomId: string, playerId: string, clientActionId: string): Promise<ActionResult | undefined> {
    const result = await this.#pool.query<{ result: ActionResult }>(
      'SELECT result FROM processed_actions WHERE room_id=$1 AND player_id=$2 AND client_action_id=$3', [roomId, playerId, clientActionId]);
    return result.rows[0]?.result;
  }

  public async loadActiveRooms(now: number): Promise<RuntimeRoom[]> {
    const result = await this.#pool.query<{
      id: string; room_code: string; game_type: RuntimeRoom['gameType']; status: RuntimeRoom['status']; host_player_id: string;
      expected_player_count: number; password_hash: string | null; settings: RuntimeRoom['settings']; current_state_version: string;
      created_at: Date; updated_at: Date; expires_at: Date; authoritative_state: { game?: RuntimeRoom['game']; turnDeadline?: number; countdownEndsAt?: number; eventSequence?: number };
    }>(`SELECT r.*, s.authoritative_state FROM rooms r
       JOIN LATERAL (SELECT authoritative_state FROM game_snapshots WHERE room_id=r.id ORDER BY state_version DESC LIMIT 1) s ON true
       WHERE r.status NOT IN ('completed','expired') AND r.expires_at > $1`, [new Date(now)]);
    const rooms: RuntimeRoom[] = [];
    for (const row of result.rows) {
      const playerRows = await this.#pool.query<{
        id: string; display_name: string; normalized_display_name: string; seat_index: number; reconnect_token_hash: string;
        ready: boolean; balance: string; eliminated: boolean; spectator: boolean; joined_at: Date; last_seen_at: Date;
      }>('SELECT * FROM players WHERE room_id=$1 AND permanently_left=false ORDER BY seat_index', [row.id]);
      rooms.push({
        id: row.id, code: row.room_code, gameType: row.game_type, status: row.status, hostPlayerId: row.host_player_id,
        expectedPlayerCount: row.expected_player_count, ...(row.password_hash === null ? {} : { passwordHash: row.password_hash }),
        settings: row.settings, stateVersion: Number(row.current_state_version),
        players: playerRows.rows.map((player) => ({
          id: player.id, displayName: player.display_name, normalizedDisplayName: player.normalized_display_name,
          seatIndex: player.seat_index, reconnectTokenHash: player.reconnect_token_hash, ready: player.ready,
          connected: false, balance: Number(player.balance), eliminated: player.eliminated, spectator: player.spectator,
          joinedAt: player.joined_at.getTime(), lastSeenAt: player.last_seen_at.getTime(), socketIds: new Set(),
        })),
        ...(row.authoritative_state.game === undefined ? {} : { game: row.authoritative_state.game }),
        createdAt: row.created_at.getTime(), updatedAt: row.updated_at.getTime(), expiresAt: row.expires_at.getTime(),
        ...(row.authoritative_state.turnDeadline === undefined ? {} : { turnDeadline: row.authoritative_state.turnDeadline }),
        ...(row.authoritative_state.countdownEndsAt === undefined ? {} : { countdownEndsAt: row.authoritative_state.countdownEndsAt }),
        eventSequence: row.authoritative_state.eventSequence ?? 0,
      });
    }
    return rooms;
  }

  public async revealAudits(roomId: string): Promise<unknown[]> {
    await this.#pool.query('UPDATE shuffle_audits SET reveal_eligibility=true WHERE room_id=$1', [roomId]);
    const result = await this.#pool.query<{ hand_or_round_number: number; game_type: string; commitment_hash: string; nonce: string; canonical_deck_order: string }>(
      'SELECT hand_or_round_number,game_type,commitment_hash,nonce,canonical_deck_order FROM shuffle_audits WHERE room_id=$1 AND reveal_eligibility=true ORDER BY created_at', [roomId]);
    return result.rows.map((row) => ({
      handOrRoundNumber: row.hand_or_round_number, gameType: row.game_type, commitment: row.commitment_hash,
      nonce: row.nonce, canonicalOrder: row.canonical_deck_order, algorithm: 'SHA-256',
      description: 'A deck-commitment audit designed to help demonstrate that the server did not modify an already committed deck during play.',
    }));
  }

  public async removePlayer(room: RuntimeRoom, playerId: string, action: PersistedAction): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE rooms SET host_player_id=$2,status=$3,current_state_version=$4,updated_at=$5 WHERE id=$1',
        [room.id, room.players.length === 0 ? null : room.hostPlayerId, room.status, room.stateVersion, new Date(room.updatedAt)]);
      await client.query('UPDATE players SET reconnect_token_hash=NULL,connected=false,permanently_left=true,last_seen_at=$3 WHERE id=$1 AND room_id=$2',
        [playerId, room.id, new Date(room.updatedAt)]);
      await client.query('INSERT INTO game_snapshots (room_id,state_version,authoritative_state) VALUES ($1,$2,$3)',
        [room.id, room.stateVersion, JSON.stringify(gameSnapshot(room))]);
      await client.query(
        `INSERT INTO game_events (room_id,state_version,sequence_number,player_id,action_type,sanitized_payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [room.id, room.stateVersion, room.eventSequence, playerId, action.actionType, JSON.stringify(action.sanitizedPayload)],
      );
      await client.query(
        `INSERT INTO processed_actions (room_id,player_id,client_action_id,resulting_state_version,result)
         VALUES ($1,$2,$3,$4,$5)`,
        [room.id, playerId, action.clientActionId, room.stateVersion, JSON.stringify(action.result)],
      );
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  public async close(): Promise<void> { await this.#pool.end(); }
}

export class MemoryRoomRepository implements RoomRepository {
  readonly rooms = new Map<string, RuntimeRoom>();
  readonly actions = new Map<string, ActionResult>();
  readonly audits = new Map<string, Map<number, unknown>>();
  public saveRoom(room: RuntimeRoom): Promise<void> { this.rooms.set(room.id, room); return Promise.resolve(); }
  public saveAction(room: RuntimeRoom, action: PersistedAction): Promise<void> {
    this.rooms.set(room.id, room); this.actions.set(`${room.id}:${action.playerId}:${action.clientActionId}`, action.result as ActionResult);
    const game = room.game;
    if (game !== undefined) {
      const number = 'handNumber' in game ? game.handNumber : game.roundNumber;
      const roomAudits = this.audits.get(room.id) ?? new Map<number, unknown>();
      roomAudits.set(number, { handOrRoundNumber: number, gameType: 'handNumber' in game ? 'poker' : 'blackjack', commitment: game.commitment,
        nonce: game.auditNonce, canonicalOrder: game.auditCanonicalOrder, algorithm: 'SHA-256',
        description: 'A deck-commitment audit designed to help demonstrate that the server did not modify an already committed deck during play.' });
      this.audits.set(room.id, roomAudits);
    }
    return Promise.resolve();
  }
  public getProcessedAction(roomId: string, playerId: string, clientActionId: string): Promise<ActionResult | undefined> {
    return Promise.resolve(this.actions.get(`${roomId}:${playerId}:${clientActionId}`));
  }
  public loadActiveRooms(now: number): Promise<RuntimeRoom[]> { return Promise.resolve([...this.rooms.values()].filter((room) => room.expiresAt > now)); }
  public revealAudits(roomId: string): Promise<unknown[]> {
    return Promise.resolve([...(this.audits.get(roomId)?.values() ?? [])]);
  }
  public removePlayer(room: RuntimeRoom, playerId: string, action: PersistedAction): Promise<void> {
    this.rooms.set(room.id, room); this.actions.set(`${room.id}:${playerId}:${action.clientActionId}`, action.result as ActionResult); return Promise.resolve();
  }
  public close(): Promise<void> { return Promise.resolve(); }
}
