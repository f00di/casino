import type { Card, RandomSource } from '../cards.js';
import { createShoe, shuffle } from '../cards.js';
import { commitDeck } from '../audit.js';

export type BlackjackPhase = 'betting' | 'insurance' | 'playing' | 'dealer' | 'settled';
export type HandOutcome = 'win' | 'loss' | 'push' | 'blackjack' | 'surrender' | 'bust';

export interface BlackjackRules {
  minimumBet: number;
  maximumBet: number;
  decks: number;
  penetrationPercent: number;
  resplitAces: boolean;
  splitTenValues: boolean;
}

export interface BlackjackHand {
  cards: Card[];
  wager: number;
  complete: boolean;
  doubled: boolean;
  surrendered: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  actionsTaken: number;
  outcome?: HandOutcome;
  payout?: number;
}

export interface BlackjackPlayer {
  id: string;
  seatIndex: number;
  balance: number;
  hands: BlackjackHand[];
  activeHandIndex: number;
  insuranceWager: number;
  betSubmitted: boolean;
  sittingOut: boolean;
  spectator: boolean;
}

export interface BlackjackState {
  roundNumber: number;
  phase: BlackjackPhase;
  players: BlackjackPlayer[];
  dealerCards: Card[];
  dealerHoleRevealed: boolean;
  shoe: Card[];
  shoeCursor: number;
  cutCardIndex: number;
  commitment: string;
  auditNonce: string;
  auditCanonicalOrder: string;
  currentPlayerId: string | undefined;
  rules: BlackjackRules;
  reshuffled: boolean;
}

export interface HandValue { total: number; soft: boolean; bust: boolean }

export function blackjackValue(cards: readonly Card[]): HandValue {
  let total = cards.reduce((sum, card) => sum + (card.rank === 14 ? 11 : Math.min(card.rank, 10)), 0);
  let acesAsEleven = cards.filter((card) => card.rank === 14).length;
  while (total > 21 && acesAsEleven > 0) { total -= 10; acesAsEleven -= 1; }
  return { total, soft: acesAsEleven > 0, bust: total > 21 };
}

export function isNatural(hand: BlackjackHand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && blackjackValue(hand.cards).total === 21;
}

function makeShoe(rules: BlackjackRules, random?: RandomSource, injectedShoe?: readonly Card[]): Pick<BlackjackState, 'shoe' | 'commitment' | 'auditNonce' | 'auditCanonicalOrder' | 'cutCardIndex'> {
  if (injectedShoe !== undefined && process.env.NODE_ENV !== 'test') throw new Error('Shoe injection is test-only.');
  const shoe = injectedShoe === undefined ? shuffle(createShoe(rules.decks), random) : [...injectedShoe];
  const expected = rules.decks * 52;
  if (shoe.length !== expected || new Set(shoe.map((card) => card.physicalId)).size !== expected) throw new Error('Shoe has invalid physical cards.');
  const audit = commitDeck(shoe);
  return { shoe, commitment: audit.commitment, auditNonce: audit.nonce, auditCanonicalOrder: audit.canonicalOrder, cutCardIndex: Math.floor(expected * rules.penetrationPercent / 100) };
}

export function createBlackjackState(
  seats: readonly { id: string; seatIndex: number; balance: number }[], rules: BlackjackRules,
  random?: RandomSource, injectedShoe?: readonly Card[],
): BlackjackState {
  if (rules.minimumBet <= 0 || rules.maximumBet < rules.minimumBet) throw new Error('Invalid blackjack betting limits.');
  const shoeState = makeShoe(rules, random, injectedShoe);
  return {
    roundNumber: 1, phase: 'betting', dealerCards: [], dealerHoleRevealed: false, shoeCursor: 0, currentPlayerId: undefined,
    players: seats.map((seat) => ({ ...seat, hands: [], activeHandIndex: 0, insuranceWager: 0, betSubmitted: false, sittingOut: false, spectator: seat.balance < rules.minimumBet })),
    rules, reshuffled: false, ...shoeState,
  };
}

function draw(state: BlackjackState): Card {
  const card = state.shoe[state.shoeCursor];
  if (card === undefined) throw new Error('Shoe exhausted.');
  state.shoeCursor += 1;
  return card;
}

export function placeBlackjackBet(state: BlackjackState, playerId: string, amount: number, sitOut = false): void {
  if (state.phase !== 'betting') throw new Error('INVALID_ACTION');
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || player.betSubmitted) throw new Error('INVALID_ACTION');
  if (sitOut) { player.sittingOut = true; player.betSubmitted = true; maybeDeal(state); return; }
  if (!Number.isInteger(amount) || amount % 2 !== 0 || amount < state.rules.minimumBet || amount > state.rules.maximumBet) throw new Error('INVALID_BET_AMOUNT');
  if (amount > player.balance) throw new Error('INSUFFICIENT_CHIPS');
  player.balance -= amount;
  player.hands = [{ cards: [], wager: amount, complete: false, doubled: false, surrendered: false, fromSplit: false, splitAces: false, actionsTaken: 0 }];
  player.betSubmitted = true;
  player.sittingOut = false;
  maybeDeal(state);
}

function maybeDeal(state: BlackjackState): void {
  const eligible = state.players.filter((player) => !player.spectator);
  if (!eligible.every((player) => player.betSubmitted)) return;
  const bettors = eligible.filter((player) => !player.sittingOut && player.hands.length > 0).sort((a, b) => a.seatIndex - b.seatIndex);
  if (bettors.length === 0) { state.phase = 'settled'; return; }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const player of bettors) player.hands[0]?.cards.push(draw(state));
    state.dealerCards.push(draw(state));
  }
  const upcard = state.dealerCards[0];
  if (upcard?.rank === 14) state.phase = 'insurance';
  else resolvePeek(state);
}

function dealerNatural(state: BlackjackState): boolean {
  return state.dealerCards.length === 2 && blackjackValue(state.dealerCards).total === 21;
}

function resolvePeek(state: BlackjackState): void {
  const upcard = state.dealerCards[0];
  const peek = upcard?.rank === 14 || (upcard !== undefined && upcard.rank >= 10);
  if (peek && dealerNatural(state)) {
    state.dealerHoleRevealed = true;
    settleBlackjack(state);
    return;
  }
  state.phase = 'playing';
  setNextPlayer(state);
}

export function decideInsurance(state: BlackjackState, playerId: string, amount: number): void {
  if (state.phase !== 'insurance') throw new Error('INVALID_ACTION');
  const player = state.players.find((candidate) => candidate.id === playerId);
  const hand = player?.hands[0];
  if (player === undefined || hand === undefined || player.insuranceWager >= 0 && hand.actionsTaken === -1) throw new Error('INVALID_ACTION');
  const maximum = Math.floor(hand.wager / 2);
  if (!Number.isInteger(amount) || amount < 0 || amount > maximum) throw new Error('INVALID_BET_AMOUNT');
  if (amount > player.balance) throw new Error('INSUFFICIENT_CHIPS');
  player.balance -= amount;
  player.insuranceWager = amount;
  hand.actionsTaken = -1; // insurance-response marker, reset before play
  const participants = state.players.filter((candidate) => candidate.hands.length > 0);
  if (participants.every((candidate) => candidate.hands[0]?.actionsTaken === -1)) {
    for (const candidate of participants) if (candidate.hands[0] !== undefined) candidate.hands[0].actionsTaken = 0;
    resolvePeek(state);
  }
}

function current(state: BlackjackState): { player: BlackjackPlayer; hand: BlackjackHand } {
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  const hand = player?.hands[player.activeHandIndex];
  if (player === undefined || hand === undefined || hand.complete) throw new Error('NOT_YOUR_TURN');
  return { player, hand };
}

export function legalBlackjackActions(state: BlackjackState, playerId: string): string[] {
  if (state.phase !== 'playing' || state.currentPlayerId !== playerId) return [];
  const { player, hand } = current(state);
  const value = blackjackValue(hand.cards);
  const actions = ['stand'];
  if (!hand.splitAces && !value.bust && value.total < 21) actions.push('hit');
  if (hand.cards.length === 2 && hand.actionsTaken === 0 && player.balance >= hand.wager && !hand.splitAces) actions.push('double');
  const [first, second] = hand.cards;
  const same = first !== undefined && second !== undefined && (first.rank === second.rank || (state.rules.splitTenValues && first.rank >= 10 && second.rank >= 10));
  if (hand.cards.length === 2 && same && player.hands.length < 4 && player.balance >= hand.wager && (!hand.splitAces || state.rules.resplitAces)) actions.push('split');
  if (!hand.fromSplit && hand.cards.length === 2 && hand.actionsTaken === 0) actions.push('surrender');
  return actions;
}

function finishAndAdvance(state: BlackjackState, hand: BlackjackHand): void {
  hand.complete = true;
  setNextPlayer(state);
}

export function applyBlackjackAction(state: BlackjackState, playerId: string, action: 'hit' | 'stand' | 'double' | 'split' | 'surrender'): void {
  if (state.currentPlayerId !== playerId || !legalBlackjackActions(state, playerId).includes(action)) throw new Error('INVALID_ACTION');
  const { player, hand } = current(state);
  hand.actionsTaken += 1;
  if (action === 'hit') {
    hand.cards.push(draw(state));
    const value = blackjackValue(hand.cards);
    if (value.bust) { hand.outcome = 'bust'; finishAndAdvance(state, hand); }
    else if (value.total === 21) finishAndAdvance(state, hand);
  } else if (action === 'stand') {
    finishAndAdvance(state, hand);
  } else if (action === 'double') {
    player.balance -= hand.wager;
    hand.wager *= 2;
    hand.doubled = true;
    hand.cards.push(draw(state));
    if (blackjackValue(hand.cards).bust) hand.outcome = 'bust';
    finishAndAdvance(state, hand);
  } else if (action === 'surrender') {
    hand.surrendered = true;
    hand.outcome = 'surrender';
    finishAndAdvance(state, hand);
  } else {
    player.balance -= hand.wager;
    const [first, second] = hand.cards;
    if (first === undefined || second === undefined) throw new Error('INVALID_ACTION');
    const splitAces = first.rank === 14;
    const left: BlackjackHand = { ...hand, cards: [first, draw(state)], fromSplit: true, splitAces, actionsTaken: 0, complete: splitAces };
    const right: BlackjackHand = { ...hand, cards: [second, draw(state)], fromSplit: true, splitAces, actionsTaken: 0, complete: splitAces };
    if (blackjackValue(left.cards).total === 21) left.complete = true;
    if (blackjackValue(right.cards).total === 21) right.complete = true;
    player.hands.splice(player.activeHandIndex, 1, left, right);
    if (left.complete) setNextPlayer(state);
  }
}

function setNextPlayer(state: BlackjackState): void {
  const ordered = state.players.filter((player) => player.hands.length > 0).sort((a, b) => a.seatIndex - b.seatIndex);
  for (const player of ordered) {
    const openIndex = player.hands.findIndex((hand) => !hand.complete);
    if (openIndex >= 0) {
      player.activeHandIndex = openIndex;
      const hand = player.hands[openIndex] as BlackjackHand;
      if (isNatural(hand) || blackjackValue(hand.cards).total === 21) { hand.complete = true; continue; }
      state.currentPlayerId = player.id;
      return;
    }
  }
  state.currentPlayerId = undefined;
  runDealer(state);
}

export function runDealer(state: BlackjackState): void {
  state.phase = 'dealer';
  state.dealerHoleRevealed = true;
  const hasLiveHand = state.players.some((player) => player.hands.some((hand) => !hand.surrendered && !blackjackValue(hand.cards).bust));
  while (hasLiveHand) {
    const value = blackjackValue(state.dealerCards);
    if (value.total >= 17) break; // stands on hard and soft 17
    state.dealerCards.push(draw(state));
  }
  settleBlackjack(state);
}

export function settleBlackjack(state: BlackjackState): void {
  const dealer = blackjackValue(state.dealerCards);
  const dealerBj = state.dealerCards.length === 2 && dealer.total === 21;
  for (const player of state.players) {
    if (player.insuranceWager > 0 && dealerBj) player.balance += player.insuranceWager * 3; // returned stake + 2:1 profit
    for (const hand of player.hands) {
      const value = blackjackValue(hand.cards);
      let payout = 0;
      if (hand.surrendered) { hand.outcome = 'surrender'; payout = Math.floor(hand.wager / 2); }
      else if (value.bust) hand.outcome = 'bust';
      else if (isNatural(hand) && dealerBj) { hand.outcome = 'push'; payout = hand.wager; }
      else if (isNatural(hand)) { hand.outcome = 'blackjack'; payout = hand.wager + Math.floor(hand.wager * 3 / 2); }
      else if (dealerBj) hand.outcome = 'loss';
      else if (dealer.bust || value.total > dealer.total) { hand.outcome = 'win'; payout = hand.wager * 2; }
      else if (value.total === dealer.total) { hand.outcome = 'push'; payout = hand.wager; }
      else hand.outcome = 'loss';
      hand.payout = payout;
      player.balance += payout;
      hand.complete = true;
    }
    player.spectator = player.balance < state.rules.minimumBet;
  }
  state.phase = 'settled';
  state.currentPlayerId = undefined;
}

export function startNextBlackjackRound(state: BlackjackState, random?: RandomSource): void {
  const needsShuffle = state.shoeCursor >= state.cutCardIndex;
  if (needsShuffle) {
    const next = makeShoe(state.rules, random);
    Object.assign(state, next);
    state.shoeCursor = 0;
  }
  state.roundNumber += 1;
  state.phase = 'betting';
  state.dealerCards = [];
  state.dealerHoleRevealed = false;
  state.currentPlayerId = undefined;
  state.reshuffled = needsShuffle;
  for (const player of state.players) {
    player.hands = []; player.activeHandIndex = 0; player.insuranceWager = 0;
    player.betSubmitted = player.spectator; player.sittingOut = false;
  }
}
