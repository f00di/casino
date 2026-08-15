import { legalBlackjackActions, legalPokerActions, type BlackjackState, type PokerState } from '@friendly-card-room/game-engine';
import type { RoomSnapshot } from '@friendly-card-room/shared';
import type { RuntimeRoom } from './models.js';

export interface PokerPlayerView {
  id: string; seatIndex: number; stack: number; streetContribution: number; totalContribution: number;
  folded: boolean; allIn: boolean; sittingOut: boolean; eliminated: boolean; lastAction?: string;
  holeCards?: PokerState['players'][number]['holeCards'];
}

export interface PokerView {
  gameType: 'poker'; handNumber: number; street: PokerState['street']; dealerSeat: number;
  smallBlindSeat: number; bigBlindSeat: number; currentPlayerId?: string; communityCards: PokerState['communityCards'];
  burnCount: number; currentBet: number; previousFullRaiseSize: number; commitment: string;
  players: PokerPlayerView[]; awards: PokerState['awards']; deadline?: number;
  legalActions: ReturnType<typeof legalPokerActions>;
}

export interface BlackjackView {
  gameType: 'blackjack'; roundNumber: number; phase: BlackjackState['phase']; dealerCards: BlackjackState['dealerCards'];
  dealerHoleRevealed: boolean; currentPlayerId?: string; commitment: string; reshuffled: boolean;
  players: BlackjackState['players']; deadline?: number;
  legalActions: string[];
}

export type PlayerGameView = PokerView | BlackjackView;

export function buildRoomSnapshot(room: RuntimeRoom): RoomSnapshot {
  return {
    roomId: room.id, roomCode: room.code, gameType: room.gameType, status: room.status,
    stateVersion: room.stateVersion, expectedPlayerCount: room.expectedPlayerCount, settings: room.settings,
    players: room.players.map((player) => ({
      id: player.id, displayName: player.displayName, seatIndex: player.seatIndex, ready: player.ready,
      connected: player.connected, isHost: player.id === room.hostPlayerId, balance: player.balance,
      eliminated: player.eliminated, spectator: player.spectator,
    })),
    ...(room.countdownEndsAt === undefined ? {} : { countdownEndsAt: room.countdownEndsAt }),
    serverTime: Date.now(),
  };
}

export function buildPlayerView(room: RuntimeRoom, requestingPlayerId: string): PlayerGameView | undefined {
  const game = room.game;
  if (game === undefined) return undefined;
  if (room.gameType === 'poker') {
    const poker = game as PokerState;
    const reveal = poker.street === 'showdown' || poker.street === 'complete';
    return {
      gameType: 'poker', handNumber: poker.handNumber, street: poker.street, dealerSeat: poker.dealerSeat,
      smallBlindSeat: poker.smallBlindSeat, bigBlindSeat: poker.bigBlindSeat,
      ...(poker.currentPlayerId === undefined ? {} : { currentPlayerId: poker.currentPlayerId }),
      communityCards: poker.communityCards, burnCount: poker.burnCards.length, currentBet: poker.currentBet,
      previousFullRaiseSize: poker.previousFullRaiseSize, commitment: poker.commitment, awards: poker.awards,
      legalActions: legalPokerActions(poker, requestingPlayerId),
      players: poker.players.map((player) => ({
        id: player.id, seatIndex: player.seatIndex, stack: player.stack, streetContribution: player.streetContribution,
        totalContribution: player.totalContribution, folded: player.folded, allIn: player.allIn,
        sittingOut: player.sittingOut, eliminated: player.eliminated,
        ...(player.lastAction === undefined ? {} : { lastAction: player.lastAction }),
        ...(player.id === requestingPlayerId || (reveal && !player.folded) ? { holeCards: player.holeCards } : {}),
      })),
      ...(room.turnDeadline === undefined ? {} : { deadline: room.turnDeadline }),
    };
  }
  const blackjack = game as BlackjackState;
  return {
    gameType: 'blackjack', roundNumber: blackjack.roundNumber, phase: blackjack.phase,
    dealerCards: blackjack.dealerHoleRevealed ? blackjack.dealerCards : blackjack.dealerCards.slice(0, 1),
    dealerHoleRevealed: blackjack.dealerHoleRevealed,
    ...(blackjack.currentPlayerId === undefined ? {} : { currentPlayerId: blackjack.currentPlayerId }),
    commitment: blackjack.commitment, reshuffled: blackjack.reshuffled,
    legalActions: legalBlackjackActions(blackjack, requestingPlayerId),
    players: blackjack.players.map((player) => ({ ...player, hands: player.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })) })),
    ...(room.turnDeadline === undefined ? {} : { deadline: room.turnDeadline }),
  };
}
