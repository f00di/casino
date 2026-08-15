import type { ReactNode } from 'react';
import type { CardData } from '../types.js';
import { cn } from '../lib.js';

const suits = { clubs: ['♣', 'black'], diamonds: ['♦', 'red'], hearts: ['♥', 'red'], spades: ['♠', 'black'] } as const;
const rank = (value: number): string => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[value] ?? String(value);
export function PlayingCard({ card, hidden = false, small = false }: { card?: CardData; hidden?: boolean; small?: boolean }): ReactNode {
  if (hidden || card === undefined) return <div aria-label="Hidden card" className={cn('card-face grid place-items-center border-gold/40 bg-[radial-gradient(circle,#315f4c_1px,#163d30_1px)] bg-[length:6px_6px]', small ? 'h-16 w-11' : 'h-24 w-16 sm:h-28 sm:w-20')}><span className="h-4/5 w-4/5 rounded border border-gold/30" /></div>;
  const [symbol, color] = suits[card.suit];
  return <div aria-label={`${rank(card.rank)} of ${card.suit}`} className={cn('card-face animate-deal bg-cream', color === 'red' ? 'text-[#a83232]' : 'text-[#172019]', small ? 'h-16 w-11 text-sm' : 'h-24 w-16 text-lg sm:h-28 sm:w-20 sm:text-xl')}><span className="absolute left-1.5 top-1 font-bold leading-none">{rank(card.rank)}<span className="block" aria-hidden="true">{symbol}</span></span><span className="text-3xl" aria-hidden="true">{symbol}</span><span className="sr-only">{rank(card.rank)} of {card.suit}</span></div>;
}
