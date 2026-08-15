import type { BlackjackState, PokerState } from '@friendly-card-room/game-engine';
import type { GameType, RoomSettings, RoomStatus } from '@friendly-card-room/shared';

export interface RuntimePlayer {
  id: string;
  displayName: string;
  normalizedDisplayName: string;
  seatIndex: number;
  reconnectTokenHash: string;
  ready: boolean;
  connected: boolean;
  balance: number;
  eliminated: boolean;
  spectator: boolean;
  joinedAt: number;
  lastSeenAt: number;
  socketIds: Set<string>;
}

export interface RuntimeRoom {
  id: string;
  code: string;
  gameType: GameType;
  status: RoomStatus;
  hostPlayerId: string;
  expectedPlayerCount: number;
  passwordHash?: string;
  settings: RoomSettings;
  stateVersion: number;
  players: RuntimePlayer[];
  game?: PokerState | BlackjackState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  turnDeadline?: number;
  countdownEndsAt?: number;
  eventSequence: number;
}

export interface PersistedAction {
  roomId: string;
  playerId: string;
  clientActionId: string;
  stateVersion: number;
  actionType: string;
  sanitizedPayload: Record<string, unknown>;
  result: unknown;
}
