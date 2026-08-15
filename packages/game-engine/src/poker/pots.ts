import type { Card } from '../cards.js';
import { compareHands, evaluateBest } from './evaluator.js';

export interface PotPlayer {
  id: string;
  seatIndex: number;
  totalContribution: number;
  folded: boolean;
  cards?: readonly Card[];
}

export interface SidePot {
  amount: number;
  threshold: number;
  eligiblePlayerIds: string[];
}

export interface PotAward extends SidePot {
  winnerIds: string[];
  awards: Record<string, number>;
}

export function buildSidePots(players: readonly PotPlayer[]): SidePot[] {
  const thresholds = [...new Set(players.map((player) => player.totalContribution).filter((amount) => amount > 0))].sort((a, b) => a - b);
  let previous = 0;
  return thresholds.map((threshold) => {
    const contributors = players.filter((player) => player.totalContribution >= threshold);
    const amount = (threshold - previous) * contributors.length;
    previous = threshold;
    return { amount, threshold, eligiblePlayerIds: contributors.filter((player) => !player.folded).map((player) => player.id) };
  }).filter((pot) => pot.amount > 0);
}

function clockwiseOrder(playerIds: readonly string[], players: readonly PotPlayer[], dealerSeat: number): string[] {
  const seats = new Map(players.map((player) => [player.id, player.seatIndex]));
  return [...playerIds].sort((left, right) => {
    const leftDistance = ((seats.get(left) ?? 0) - dealerSeat + 100) % 100;
    const rightDistance = ((seats.get(right) ?? 0) - dealerSeat + 100) % 100;
    return (leftDistance || 100) - (rightDistance || 100);
  });
}

export function settlePots(players: readonly PotPlayer[], board: readonly Card[], dealerSeat: number): PotAward[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return buildSidePots(players).map((pot) => {
    const eligible = pot.eligiblePlayerIds.map((id) => byId.get(id)).filter((player): player is PotPlayer => player !== undefined && player.cards !== undefined);
    if (eligible.length === 0) throw new Error('A pot has no eligible player with cards.');
    const evaluations = eligible.map((player) => ({ player, hand: evaluateBest([...(player.cards ?? []), ...board]) }));
    const best = evaluations.reduce((winner, candidate) => compareHands(candidate.hand, winner.hand) > 0 ? candidate : winner).hand;
    const winnerIds = evaluations.filter(({ hand }) => compareHands(hand, best) === 0).map(({ player }) => player.id);
    const each = Math.floor(pot.amount / winnerIds.length);
    let odd = pot.amount % winnerIds.length;
    const awards = Object.fromEntries(winnerIds.map((id) => [id, each]));
    for (const id of clockwiseOrder(winnerIds, players, dealerSeat)) {
      if (odd === 0) break;
      awards[id] = (awards[id] ?? 0) + 1;
      odd -= 1;
    }
    return { ...pot, winnerIds, awards };
  });
}
