import { createHash, randomBytes } from 'node:crypto';
import type { Card } from './cards.js';
import { canonicalDeck } from './cards.js';

export interface DeckCommitment {
  commitment: string;
  nonce: string;
  canonicalOrder: string;
}

export function calculateCommitment(nonce: string, canonicalOrder: string): string {
  return createHash('sha256').update(nonce, 'utf8').update(canonicalOrder, 'utf8').digest('hex');
}

export function commitDeck(cards: readonly Card[], nonce = randomBytes(32).toString('hex')): DeckCommitment {
  const canonicalOrder = canonicalDeck(cards);
  return { nonce, canonicalOrder, commitment: calculateCommitment(nonce, canonicalOrder) };
}

export function verifyCommitment(value: DeckCommitment): boolean {
  return calculateCommitment(value.nonce, value.canonicalOrder) === value.commitment;
}
