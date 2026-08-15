import { X } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib.js';

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }): ReactNode {
  const variants = { primary: 'bg-gold text-ink hover:bg-[#e1c174]', secondary: 'bg-white/10 text-white hover:bg-white/15 border border-white/10', danger: 'bg-danger/15 text-[#ffb0a8] border border-danger/30 hover:bg-danger/25', ghost: 'text-muted hover:text-white hover:bg-white/5' };
  return <button className={cn('min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40', variants[variant], className)} {...props} />;
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input className={cn('min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 text-white outline-none placeholder:text-muted/60 focus:border-gold/70 focus:ring-2 focus:ring-gold/20', className)} {...props} />;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactNode {
  return <label className="grid gap-1.5 text-sm font-medium text-gray-200"><span>{label}</span>{children}{hint !== undefined && <span className="text-xs font-normal text-muted">{hint}</span>}</label>;
}
export function Panel({ className, children }: { className?: string; children: ReactNode }): ReactNode { return <section className={cn('rounded-2xl border border-white/10 bg-panel/95 p-5 shadow-card', className)}>{children}</section>; }
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }): ReactNode {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><Panel className="w-full max-w-md"><div className="mb-4 flex items-center justify-between"><h2 id="dialog-title" className="text-xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-muted hover:bg-white/10 hover:text-white"><X size={20} /></button></div>{children}</Panel></div>;
}
