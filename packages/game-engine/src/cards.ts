import { randomInt } from 'node:crypto';

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Distinguishes physically identical cards in a multi-deck shoe. */
  physicalId: string;
  deckIndex: number;
}

export interface RandomSource {
  integer(maxExclusive: number): number;
}

const cryptoRandom: RandomSource = { integer: (maxExclusive) => randomInt(0, maxExclusive) };

export function createDeck(deckIndex = 0): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({
    rank,
    suit,
    deckIndex,
    physicalId: `${deckIndex}:${suit}:${rank}`,
  })));
}

export function createShoe(deckCount: number): Card[] {
  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 8) throw new Error('Deck count must be an integer from 1 through 8.');
  return Array.from({ length: deckCount }, (_, deckIndex) => createDeck(deckIndex)).flat();
}

/** Fisher-Yates with rejection-free random integers supplied by Node crypto in production. */
export function shuffle<T>(values: readonly T[], random: RandomSource = cryptoRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.integer(index + 1);
    if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex > index) throw new Error('Random source returned an invalid integer.');
    [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
  }
  return result;
}

export function rankLabel(rank: Rank): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Partial<Record<Rank, string>>)[rank] ?? String(rank);
}

export function cardCode(card: Card): string {
  return `${rankLabel(card.rank)}${card.suit[0]?.toUpperCase() ?? '?'}`;
}

export function canonicalDeck(cards: readonly Card[]): string {
  return cards.map((card) => `${card.deckIndex}:${card.suit}:${card.rank}:${card.physicalId}`).join('|');
}
