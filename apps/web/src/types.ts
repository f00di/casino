import type { RoomSnapshot } from '@friendly-card-room/shared';

export interface CardData { rank: number; suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; physicalId: string; deckIndex: number }
export interface PokerPlayerView {
  id: string; seatIndex: number; stack: number; streetContribution: number; totalContribution: number;
  folded: boolean; allIn: boolean; sittingOut: boolean; eliminated: boolean; lastAction?: string; holeCards?: CardData[];
}
export interface LegalPokerActions {
  fold: boolean; check: boolean; callAmount?: number; minimumBetTo?: number; minimumRaiseTo?: number; maximumTo: number; allIn: boolean;
}
export interface PokerView {
  gameType: 'poker'; handNumber: number; street: string; dealerSeat: number; smallBlindSeat: number; bigBlindSeat: number;
  currentPlayerId?: string; communityCards: CardData[]; burnCount: number; currentBet: number; previousFullRaiseSize: number;
  commitment: string; players: PokerPlayerView[]; awards: { amount: number; winnerIds: string[]; awards: Record<string, number> }[];
  deadline?: number; legalActions: LegalPokerActions;
}
export interface BlackjackHandView { cards: CardData[]; wager: number; complete: boolean; doubled: boolean; surrendered: boolean; fromSplit: boolean; splitAces: boolean; actionsTaken: number; outcome?: string; payout?: number }
export interface BlackjackPlayerView { id: string; seatIndex: number; balance: number; hands: BlackjackHandView[]; activeHandIndex: number; insuranceWager: number; betSubmitted: boolean; sittingOut: boolean; spectator: boolean }
export interface BlackjackView {
  gameType: 'blackjack'; roundNumber: number; phase: string; dealerCards: CardData[]; dealerHoleRevealed: boolean;
  currentPlayerId?: string; commitment: string; reshuffled: boolean; players: BlackjackPlayerView[]; deadline?: number; legalActions: string[];
}
export type GameView = PokerView | BlackjackView;
export interface StoredSession { roomId: string; playerId: string; reconnectToken: string }
export interface AppState { room?: RoomSnapshot; game?: GameView; session?: StoredSession }
