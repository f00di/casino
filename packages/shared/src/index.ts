import { z } from 'zod';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const DISPLAY_NAME_MAX_LENGTH = 24;
export const CHAT_MESSAGE_MAX_LENGTH = 300;

export const ErrorCode = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_LOCKED: 'ROOM_LOCKED',
  INVALID_ROOM_PASSWORD: 'INVALID_ROOM_PASSWORD',
  DISPLAY_NAME_TAKEN: 'DISPLAY_NAME_TAKEN',
  INVALID_RECONNECT_TOKEN: 'INVALID_RECONNECT_TOKEN',
  PLAYER_NOT_READY: 'PLAYER_NOT_READY',
  NOT_ROOM_HOST: 'NOT_ROOM_HOST',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_ACTION: 'INVALID_ACTION',
  INVALID_BET_AMOUNT: 'INVALID_BET_AMOUNT',
  INVALID_RAISE_AMOUNT: 'INVALID_RAISE_AMOUNT',
  INSUFFICIENT_CHIPS: 'INSUFFICIENT_CHIPS',
  STATE_VERSION_CONFLICT: 'STATE_VERSION_CONFLICT',
  ACTION_ALREADY_PROCESSED: 'ACTION_ALREADY_PROCESSED',
  TURN_EXPIRED: 'TURN_EXPIRED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SERVER_RECOVERING: 'SERVER_RECOVERING',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export type GameType = 'poker' | 'blackjack';
export type RoomStatus = 'lobby' | 'starting' | 'active' | 'paused' | 'completed' | 'expired';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
export const roomCodeSchema = z.string().trim().toUpperCase().regex(ROOM_CODE_PATTERN);
export const displayNameSchema = boundedText(DISPLAY_NAME_MAX_LENGTH);
export const passwordSchema = z.string().min(4).max(72);
export const idSchema = z.uuid();
export const clientActionIdSchema = z.uuid();

export const pokerSettingsSchema = z.object({
  startingBalance: z.number().int().min(100).max(10_000_000).default(10_000),
  smallBlind: z.number().int().min(1).max(100_000).default(50),
  bigBlind: z.number().int().min(2).max(200_000).default(100),
  timedBlindMinutes: z.number().int().min(0).max(240).default(0),
  pauseBetweenHands: z.boolean().default(false),
});

export const blackjackSettingsSchema = z.object({
  startingBalance: z.number().int().min(20).max(10_000_000).default(2_000),
  minimumBet: z.number().int().min(2).max(100_000).default(20),
  maximumBet: z.number().int().min(2).max(1_000_000).default(1_000),
  decks: z.number().int().min(1).max(8).default(6),
  penetrationPercent: z.number().int().min(50).max(90).default(75),
  resplitAces: z.boolean().default(false),
  splitTenValues: z.boolean().default(false),
});

export const roomSettingsSchema = z.object({
  turnSeconds: z.number().int().min(10).max(180).default(30),
  hostGraceSeconds: z.number().int().min(5).max(300).default(30),
  autoStart: z.boolean().default(false),
  poker: pokerSettingsSchema.optional(),
  blackjack: blackjackSettingsSchema.optional(),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const createRoomSchema = z.object({
  displayName: displayNameSchema,
  password: passwordSchema.optional(),
  gameType: z.enum(['poker', 'blackjack']),
  expectedPlayerCount: z.number().int().min(1).max(9),
  settings: roomSettingsSchema,
}).superRefine((value, context) => {
  const minimum = value.gameType === 'poker' ? 2 : 1;
  const maximum = value.gameType === 'poker' ? 9 : 7;
  if (value.expectedPlayerCount < minimum || value.expectedPlayerCount > maximum) {
    context.addIssue({ code: 'custom', path: ['expectedPlayerCount'], message: `Player count must be ${minimum}-${maximum}.` });
  }
});

export const joinRoomSchema = z.object({
  displayName: displayNameSchema,
  roomCode: roomCodeSchema,
  password: passwordSchema.optional(),
});

export const reconnectSchema = z.object({
  roomId: idSchema,
  playerId: idSchema,
  reconnectToken: z.string().min(32).max(256),
});

export const actionEnvelopeSchema = z.object({
  clientActionId: clientActionIdSchema,
  roomId: idSchema,
  playerId: idSchema,
  expectedStateVersion: z.number().int().nonnegative(),
});

export const pokerActionSchema = actionEnvelopeSchema.extend({
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fold') }),
    z.object({ type: z.literal('check') }),
    z.object({ type: z.literal('call') }),
    z.object({ type: z.literal('all-in') }),
    z.object({ type: z.literal('bet'), betTo: z.number().int().positive() }),
    z.object({ type: z.literal('raise'), raiseTo: z.number().int().positive() }),
    z.object({ type: z.literal('sit-out') }),
  ]),
});

export const blackjackActionSchema = actionEnvelopeSchema.extend({
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('hit') }),
    z.object({ type: z.literal('stand') }),
    z.object({ type: z.literal('double') }),
    z.object({ type: z.literal('split') }),
    z.object({ type: z.literal('surrender') }),
  ]),
});

export const blackjackBetSchema = actionEnvelopeSchema.extend({
  amount: z.number().int().positive(),
  sitOut: z.boolean().default(false),
});

export const insuranceSchema = actionEnvelopeSchema.extend({
  take: z.boolean(),
  amount: z.number().int().nonnegative(),
});

export const readySchema = actionEnvelopeSchema.extend({ ready: z.boolean() });
export const startSchema = actionEnvelopeSchema;
export const nextHandSchema = actionEnvelopeSchema;
export const nextRoundSchema = actionEnvelopeSchema;
export const endSessionSchema = actionEnvelopeSchema;
export const stateRequestSchema = actionEnvelopeSchema.pick({ roomId: true, playerId: true });
export const leaveSchema = actionEnvelopeSchema.extend({ permanent: z.boolean().default(false) });
export const updateSettingsSchema = actionEnvelopeSchema.extend({ settings: roomSettingsSchema });
export const chatSchema = actionEnvelopeSchema.pick({ roomId: true, playerId: true }).extend({
  clientActionId: clientActionIdSchema,
  message: boundedText(CHAT_MESSAGE_MAX_LENGTH),
});

export interface ActionResult<T = unknown> {
  ok: boolean;
  code?: ErrorCode;
  message: string;
  stateVersion: number;
  data?: T;
}

export interface PlayerSummary {
  id: string;
  displayName: string;
  seatIndex: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  balance: number;
  eliminated: boolean;
  spectator: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  gameType: GameType;
  status: RoomStatus;
  stateVersion: number;
  expectedPlayerCount: number;
  settings: RoomSettings;
  players: PlayerSummary[];
  countdownEndsAt?: number;
  serverTime: number;
}

export interface JoinResult {
  room: RoomSnapshot;
  playerId: string;
  reconnectToken: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

export const socketEventSchemas = {
  'room:create': createRoomSchema,
  'room:join': joinRoomSchema,
  'room:reconnect': reconnectSchema,
  'room:setReady': readySchema,
  'room:updateSettings': updateSettingsSchema,
  'room:start': startSchema,
  'room:leave': leaveSchema,
  'room:chat': chatSchema,
  'state:request': stateRequestSchema,
  'poker:action': pokerActionSchema,
  'poker:nextHand': nextHandSchema,
  'blackjack:placeBet': blackjackBetSchema,
  'blackjack:insurance': insuranceSchema,
  'blackjack:action': blackjackActionSchema,
  'blackjack:nextRound': nextRoundSchema,
  'session:end': endSessionSchema,
} as const;

export type CreateRoomInput = z.input<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type PokerActionRequest = z.infer<typeof pokerActionSchema>;
export type BlackjackActionRequest = z.infer<typeof blackjackActionSchema>;
