import type { Card, RandomSource } from '../cards.js';
import { createDeck, shuffle } from '../cards.js';
import { commitDeck } from '../audit.js';
import { settlePots, type PotAward } from './pots.js';

export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'all-in' }
  | { type: 'bet'; betTo: number }
  | { type: 'raise'; raiseTo: number }
  | { type: 'sit-out' };

export interface PokerPlayerState {
  id: string;
  seatIndex: number;
  stack: number;
  holeCards: Card[];
  streetContribution: number;
  totalContribution: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  eliminated: boolean;
  actedSinceFullRaise: boolean;
  canRaise: boolean;
  lastActedBet: number;
  lastAction?: string;
}

export interface PokerRules {
  smallBlind: number;
  bigBlind: number;
}

export interface PokerState {
  handNumber: number;
  players: PokerPlayerState[];
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  currentPlayerId: string | undefined;
  street: PokerStreet;
  communityCards: Card[];
  burnCards: Card[];
  deck: Card[];
  deckCursor: number;
  commitment: string;
  auditNonce: string;
  auditCanonicalOrder: string;
  currentBet: number;
  previousFullRaiseSize: number;
  lastAggressorId: string | undefined;
  rules: PokerRules;
  awards: PotAward[];
  winnerByFoldId?: string;
}

export interface LegalPokerActions {
  fold: boolean;
  check: boolean;
  callAmount?: number;
  minimumBetTo?: number;
  minimumRaiseTo?: number;
  maximumTo: number;
  allIn: boolean;
}

function nextSeat(players: readonly PokerPlayerState[], fromSeat: number, predicate: (player: PokerPlayerState) => boolean): PokerPlayerState {
  const candidates = players.filter(predicate).sort((a, b) => a.seatIndex - b.seatIndex);
  const next = candidates.find((player) => player.seatIndex > fromSeat) ?? candidates[0];
  if (next === undefined) throw new Error('No eligible next seat.');
  return next;
}

function draw(state: PokerState): Card {
  const card = state.deck[state.deckCursor];
  if (card === undefined) throw new Error('Deck exhausted.');
  state.deckCursor += 1;
  return card;
}

function postBlind(player: PokerPlayerState, amount: number): void {
  const posted = Math.min(amount, player.stack);
  player.stack -= posted;
  player.streetContribution += posted;
  player.totalContribution += posted;
  player.allIn = player.stack === 0;
  player.lastAction = `posted ${posted}`;
}

export function createPokerState(
  seats: readonly { id: string; seatIndex: number; stack: number; sittingOut?: boolean }[],
  rules: PokerRules,
  dealerSeat: number,
  handNumber = 1,
  random?: RandomSource,
  injectedDeck?: readonly Card[],
): PokerState {
  if (rules.smallBlind <= 0 || rules.bigBlind < rules.smallBlind) throw new Error('Invalid blinds.');
  if (injectedDeck !== undefined && process.env.NODE_ENV !== 'test') throw new Error('Deck injection is test-only.');
  const deck = injectedDeck === undefined ? shuffle(createDeck(), random) : [...injectedDeck];
  if (new Set(deck.map((card) => card.physicalId)).size !== 52 || deck.length !== 52) throw new Error('Poker deck must contain 52 unique cards.');
  const audit = commitDeck(deck);
  const players: PokerPlayerState[] = seats.map((seat) => ({
    ...seat,
    sittingOut: seat.sittingOut ?? false,
    eliminated: seat.stack === 0,
    holeCards: [], streetContribution: 0, totalContribution: 0,
    folded: false, allIn: false, actedSinceFullRaise: false, canRaise: true, lastActedBet: 0,
  }));
  const eligible = players.filter((player) => !player.eliminated && !player.sittingOut);
  if (eligible.length < 2) throw new Error('At least two active players are required.');
  const dealer = eligible.find((player) => player.seatIndex === dealerSeat) ?? nextSeat(players, dealerSeat, (player) => eligible.includes(player));
  const headsUp = eligible.length === 2;
  const smallBlind = headsUp ? dealer : nextSeat(players, dealer.seatIndex, (player) => eligible.includes(player));
  const bigBlind = nextSeat(players, smallBlind.seatIndex, (player) => eligible.includes(player));
  const state: PokerState = {
    handNumber, players, dealerSeat: dealer.seatIndex, smallBlindSeat: smallBlind.seatIndex, bigBlindSeat: bigBlind.seatIndex,
    street: 'preflop', communityCards: [], burnCards: [], deck, deckCursor: 0,
    commitment: audit.commitment, auditNonce: audit.nonce, auditCanonicalOrder: audit.canonicalOrder,
    currentPlayerId: undefined, lastAggressorId: undefined,
    currentBet: rules.bigBlind, previousFullRaiseSize: rules.bigBlind, rules, awards: [],
  };
  let dealFrom = dealer.seatIndex;
  for (let round = 0; round < 2; round += 1) {
    for (let dealt = 0; dealt < eligible.length; dealt += 1) {
      const player = nextSeat(players, dealFrom, (candidate) => eligible.includes(candidate));
      player.holeCards.push(draw(state));
      dealFrom = player.seatIndex;
    }
    dealFrom = dealer.seatIndex;
  }
  postBlind(smallBlind, rules.smallBlind);
  postBlind(bigBlind, rules.bigBlind);
  state.currentBet = Math.max(...eligible.map((player) => player.streetContribution));
  const first = headsUp ? dealer : nextSeat(players, bigBlind.seatIndex, (player) => eligible.includes(player) && !player.allIn);
  state.currentPlayerId = first.allIn ? undefined : first.id;
  normalizeProgress(state);
  return state;
}

export function legalPokerActions(state: PokerState, playerId: string): LegalPokerActions {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || state.currentPlayerId !== playerId || player.folded || player.allIn || player.eliminated || player.sittingOut) {
    return { fold: false, check: false, maximumTo: 0, allIn: false };
  }
  const owed = Math.max(0, state.currentBet - player.streetContribution);
  const maximumTo = player.streetContribution + player.stack;
  const mayRaise = player.canRaise && maximumTo > state.currentBet;
  return {
    fold: true,
    check: owed === 0,
    ...(owed > 0 ? { callAmount: Math.min(owed, player.stack) } : {}),
    ...(state.currentBet === 0 && player.stack > 0 ? { minimumBetTo: Math.min(state.rules.bigBlind, maximumTo) } : {}),
    ...(state.currentBet > 0 && mayRaise ? { minimumRaiseTo: state.currentBet < state.rules.bigBlind ? state.rules.bigBlind : state.currentBet + state.previousFullRaiseSize } : {}),
    maximumTo,
    allIn: player.stack > 0,
  };
}

function commitChips(player: PokerPlayerState, target: number): number {
  const amount = target - player.streetContribution;
  if (!Number.isInteger(target) || amount < 0 || amount > player.stack) throw new Error('INVALID_BET_AMOUNT');
  player.stack -= amount;
  player.streetContribution += amount;
  player.totalContribution += amount;
  player.allIn = player.stack === 0;
  return amount;
}

function bettingComplete(state: PokerState): boolean {
  const actionable = state.players.filter((player) => !player.folded && !player.allIn && !player.eliminated && !player.sittingOut);
  return actionable.every((player) => player.actedSinceFullRaise && player.streetContribution === state.currentBet);
}

function nextActionable(state: PokerState, fromSeat: number): PokerPlayerState | undefined {
  const eligible = state.players.filter((player) => !player.folded && !player.allIn && !player.eliminated && !player.sittingOut);
  if (eligible.length === 0) return undefined;
  return nextSeat(state.players, fromSeat, (player) => eligible.includes(player));
}

function dealStreet(state: PokerState): void {
  for (const player of state.players) {
    player.streetContribution = 0;
    player.actedSinceFullRaise = false;
    player.canRaise = true;
    player.lastActedBet = 0;
  }
  state.currentBet = 0;
  state.previousFullRaiseSize = state.rules.bigBlind;
  state.lastAggressorId = undefined;
  state.burnCards.push(draw(state));
  if (state.street === 'preflop') {
    state.communityCards.push(draw(state), draw(state), draw(state)); state.street = 'flop';
  } else if (state.street === 'flop') {
    state.communityCards.push(draw(state)); state.street = 'turn';
  } else if (state.street === 'turn') {
    state.communityCards.push(draw(state)); state.street = 'river';
  }
  state.currentPlayerId = nextActionable(state, state.dealerSeat)?.id;
}

function showdown(state: PokerState): void {
  state.street = 'showdown';
  state.currentPlayerId = undefined;
  state.awards = settlePots(state.players.map((player) => ({
    id: player.id,
    seatIndex: player.seatIndex,
    totalContribution: player.totalContribution,
    folded: player.folded,
    cards: player.holeCards,
  })), state.communityCards, state.dealerSeat);
  for (const award of state.awards) {
    for (const [id, amount] of Object.entries(award.awards)) {
      const player = state.players.find((candidate) => candidate.id === id);
      if (player !== undefined) player.stack += amount;
    }
  }
  state.street = 'complete';
}

function normalizeProgress(state: PokerState): void {
  const contenders = state.players.filter((player) => !player.folded && !player.eliminated && !player.sittingOut);
  if (contenders.length === 1) {
    const winner = contenders[0] as PokerPlayerState;
    const pot = state.players.reduce((sum, player) => sum + player.totalContribution, 0);
    winner.stack += pot;
    state.winnerByFoldId = winner.id;
    state.street = 'complete';
    state.currentPlayerId = undefined;
    return;
  }
  const canAct = contenders.filter((player) => !player.allIn);
  if (canAct.length <= 1 && canAct.every((player) => player.streetContribution === state.currentBet)) {
    while (state.communityCards.length < 5) dealStreet(state);
    showdown(state);
    return;
  }
  if (!bettingComplete(state)) return;
  if (state.street === 'river') { showdown(state); return; }
  dealStreet(state);
  normalizeProgress(state);
}

export function applyPokerAction(state: PokerState, playerId: string, action: PokerAction): PokerState {
  if (state.street === 'complete' || state.street === 'showdown') throw new Error('SESSION_COMPLETED');
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || state.currentPlayerId !== playerId) throw new Error('NOT_YOUR_TURN');
  const legal = legalPokerActions(state, playerId);
  const previousBet = state.currentBet;
  if (action.type === 'fold' || action.type === 'sit-out') {
    player.folded = true;
    if (action.type === 'sit-out') player.sittingOut = true;
  } else if (action.type === 'check') {
    if (!legal.check) throw new Error('INVALID_ACTION');
  } else if (action.type === 'call') {
    if (legal.callAmount === undefined) throw new Error('INVALID_ACTION');
    commitChips(player, player.streetContribution + legal.callAmount);
  } else {
    let target: number;
    if (action.type === 'all-in') target = legal.maximumTo;
    else if (action.type === 'bet') target = action.betTo;
    else target = action.raiseTo;
    if (action.type !== 'all-in' && target > legal.maximumTo) throw new Error('INSUFFICIENT_CHIPS');
    if (target <= previousBet && action.type !== 'all-in') throw new Error(action.type === 'raise' ? 'INVALID_RAISE_AMOUNT' : 'INVALID_BET_AMOUNT');
    if (target > previousBet && !player.canRaise) throw new Error('INVALID_RAISE_AMOUNT');
    const minimumFull = previousBet === 0 ? state.rules.bigBlind : previousBet < state.rules.bigBlind ? state.rules.bigBlind : previousBet + state.previousFullRaiseSize;
    const isAllIn = target === legal.maximumTo;
    if (target < minimumFull && !isAllIn) throw new Error(action.type === 'raise' ? 'INVALID_RAISE_AMOUNT' : 'INVALID_BET_AMOUNT');
    commitChips(player, target);
    if (target > previousBet) {
      const increment = target - previousBet;
      state.currentBet = target;
      state.lastAggressorId = player.id;
      const isFullRaise = previousBet < state.rules.bigBlind ? target >= state.rules.bigBlind : increment >= state.previousFullRaiseSize;
      if (isFullRaise) {
        state.previousFullRaiseSize = previousBet < state.rules.bigBlind ? state.rules.bigBlind : increment;
        for (const candidate of state.players) {
          if (candidate.id !== player.id && !candidate.folded && !candidate.allIn) {
            candidate.actedSinceFullRaise = false;
            candidate.canRaise = true;
          }
        }
      } else {
        for (const candidate of state.players) {
          if (candidate.id !== player.id && candidate.actedSinceFullRaise && (previousBet === 0 || state.currentBet - candidate.lastActedBet >= state.previousFullRaiseSize)) candidate.canRaise = true;
        }
      }
    }
  }
  player.actedSinceFullRaise = true;
  player.canRaise = false;
  player.lastActedBet = state.currentBet;
  player.lastAction = action.type;
  const next = nextActionable(state, player.seatIndex);
  state.currentPlayerId = next?.id;
  normalizeProgress(state);
  return state;
}

export function nextPokerDealerSeat(state: PokerState): number {
  return nextSeat(state.players, state.dealerSeat, (player) => player.stack > 0 && !player.sittingOut).seatIndex;
}

export function startNextPokerHand(state: PokerState, random?: RandomSource, injectedDeck?: readonly Card[]): PokerState {
  if (state.street !== 'complete') throw new Error('The current hand is not complete.');
  const eligible = state.players.filter((player) => player.stack > 0 && !player.sittingOut);
  if (eligible.length < 2) throw new Error('SESSION_COMPLETED');
  const dealerSeat = nextPokerDealerSeat(state);
  return createPokerState(
    state.players.map((player) => ({ id: player.id, seatIndex: player.seatIndex, stack: player.stack, sittingOut: player.sittingOut })),
    state.rules, dealerSeat, state.handNumber + 1, random, injectedDeck,
  );
}
