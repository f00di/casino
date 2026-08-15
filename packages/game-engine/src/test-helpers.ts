import type { Card, Rank, Suit } from './cards.js';
import { createDeck, createShoe } from './cards.js';

const suitMap: Record<string, Suit> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const rankMap: Record<string, Rank> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };

export function card(code: string, deckIndex = 0): Card {
  const rankText = code.slice(0, -1);
  const suitText = code.at(-1);
  const suit = suitText === undefined ? undefined : suitMap[suitText];
  const rank = rankMap[rankText] ?? Number(rankText) as Rank;
  if (suit === undefined || !Number.isInteger(rank) || rank < 2 || rank > 14) throw new Error(`Invalid card code ${code}`);
  return { rank, suit, deckIndex, physicalId: `${deckIndex}:${suit}:${rank}` };
}

export function cards(codes: string): Card[] { return codes.split(/\s+/u).filter(Boolean).map((code) => card(code)); }

export function riggedDeck(frontCodes: string): Card[] {
  const front = cards(frontCodes);
  const used = new Set(front.map((value) => value.physicalId));
  return [...front, ...createDeck().filter((value) => !used.has(value.physicalId))];
}

export function riggedShoe(frontCodes: string, decks = 1): Card[] {
  const front = cards(frontCodes);
  const used = new Set(front.map((value) => value.physicalId));
  return [...front, ...createShoe(decks).filter((value) => !used.has(value.physicalId))];
}
