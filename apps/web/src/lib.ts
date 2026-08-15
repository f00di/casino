import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...values: ClassValue[]): string { return twMerge(clsx(values)); }
export function formatNumber(value: number): string { return new Intl.NumberFormat().format(value); }
export function formatCredits(halfCredits: number): string { return `${(halfCredits / 2).toLocaleString(undefined, { maximumFractionDigits: 1 })}`; }
export function clientActionId(): string { return crypto.randomUUID(); }
