import type { Card, Rank } from '../cards.js';

export type HandCategory = 'high-card' | 'one-pair' | 'two-pair' | 'three-of-a-kind' | 'straight' | 'flush' | 'full-house' | 'four-of-a-kind' | 'straight-flush';

const CATEGORY_VALUE: Record<HandCategory, number> = {
  'high-card': 0,
  'one-pair': 1,
  'two-pair': 2,
  'three-of-a-kind': 3,
  straight: 4,
  flush: 5,
  'full-house': 6,
  'four-of-a-kind': 7,
  'straight-flush': 8,
};

export interface EvaluatedHand {
  category: HandCategory;
  score: readonly number[];
  cards: readonly Card[];
  description: string;
}

function straightHigh(ranks: readonly number[]): number | undefined {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const slice = unique.slice(index, index + 5);
    if (slice.every((rank, offset) => rank === (slice[0] as number) - offset)) return slice[0];
  }
  return undefined;
}

function compareScore(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function compareHands(left: EvaluatedHand, right: EvaluatedHand): number {
  return compareScore(left.score, right.score);
}

export function evaluateFive(cards: readonly Card[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error('Exactly five cards are required.');
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const counts = new Map<number, number>();
  for (const card of sorted) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA);
  const flush = new Set(sorted.map((card) => card.suit)).size === 1;
  const highStraight = straightHigh(sorted.map((card) => card.rank));
  let category: HandCategory;
  let tieBreakers: number[];

  if (flush && highStraight !== undefined) {
    category = 'straight-flush'; tieBreakers = [highStraight];
  } else if (groups[0]?.[1] === 4) {
    category = 'four-of-a-kind'; tieBreakers = [groups[0][0], groups[1]?.[0] ?? 0];
  } else if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    category = 'full-house'; tieBreakers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 'flush'; tieBreakers = sorted.map((card) => card.rank);
  } else if (highStraight !== undefined) {
    category = 'straight'; tieBreakers = [highStraight];
  } else if (groups[0]?.[1] === 3) {
    category = 'three-of-a-kind'; tieBreakers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  } else if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    category = 'two-pair'; tieBreakers = [...pairs, groups.find(([, count]) => count === 1)?.[0] ?? 0];
  } else if (groups[0]?.[1] === 2) {
    category = 'one-pair'; tieBreakers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  } else {
    category = 'high-card'; tieBreakers = sorted.map((card) => card.rank);
  }
  return { category, score: [CATEGORY_VALUE[category], ...tieBreakers], cards: sorted, description: category.replaceAll('-', ' ') };
}

function combinations<T>(values: readonly T[], choose: number): T[][] {
  const output: T[][] = [];
  const visit = (start: number, selected: T[]): void => {
    if (selected.length === choose) { output.push(selected); return; }
    for (let index = start; index <= values.length - (choose - selected.length); index += 1) {
      visit(index + 1, [...selected, values[index] as T]);
    }
  };
  visit(0, []);
  return output;
}

export function evaluateBest(cards: readonly Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) throw new Error('Five to seven cards are required.');
  const evaluated = combinations(cards, 5).map(evaluateFive);
  return evaluated.reduce((best, hand) => compareHands(hand, best) > 0 ? hand : best);
}

export function rank(value: number): Rank { return value as Rank; }
