import { describe, expect, it } from 'vitest';
import { commitDeck, verifyCommitment } from './audit.js';
import { createDeck, createShoe, shuffle } from './cards.js';

describe('secure card primitives', () => {
  it('creates exactly 52 unique poker cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.physicalId))).toHaveLength(52);
  });

  it('creates unique physical IDs across blackjack decks', () => {
    const shoe = createShoe(6);
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((card) => card.physicalId)).size).toBe(312);
  });

  it('shuffle neither duplicates nor removes cards', () => {
    const deck = createDeck();
    let value = 0;
    const shuffled = shuffle(deck, { integer: (max) => (value++ * 17) % max });
    expect(new Set(shuffled.map((card) => card.physicalId))).toEqual(new Set(deck.map((card) => card.physicalId)));
  });

  it('verifies commitments and detects modification', () => {
    const commitment = commitDeck(createDeck(), 'fixed-test-nonce');
    expect(verifyCommitment(commitment)).toBe(true);
    expect(verifyCommitment({ ...commitment, canonicalOrder: `${commitment.canonicalOrder}|changed` })).toBe(false);
  });
});
