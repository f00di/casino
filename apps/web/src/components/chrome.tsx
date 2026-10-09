import { Copy, MessageCircle, Settings, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../game-context.js';
import { Button, Input, Panel } from './ui.js';

export function AppHeader(): ReactNode {
  const { connection, retry } = useGame();
  const online = connection === 'connected';
  return <><header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><Link to="/" className="font-serif text-lg font-semibold tracking-wide text-cream sm:text-xl">Friendly Card Room</Link><div className="flex items-center gap-3"><span className="hidden text-xs text-muted sm:inline">Play-money only — no cash value.</span><button onClick={online ? undefined : retry} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs" aria-label={`Connection: ${connection}`}>{online ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-danger" />}<span className="hidden capitalize sm:inline">{connection}</span></button></div></div></header><div className="border-b border-gold/10 bg-gold/5 py-1.5 text-center text-xs font-medium text-gold sm:hidden">Play-money only — no cash value.</div></>;
}

export function ConnectionBanner(): ReactNode {
  const { connection, retry } = useGame();
  if (connection === 'connected') return null;
  const copy = connection === 'not-configured' ? 'The card room server is not online yet, so rooms cannot be created or joined right now.' : connection === 'reconnecting' ? 'Connection lost. Reconnecting with secure exponential backoff…' : connection === 'unavailable' ? 'Server unavailable.' : 'Connecting to the card room…';
  return <div className="fixed inset-x-3 top-20 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-danger/30 bg-[#321d1b] px-4 py-3 text-sm shadow-card" role="alert"><span>{copy}</span>{connection !== 'not-configured' && <Button variant="secondary" onClick={retry}>Retry connection</Button>}</div>;
}

export function Toasts(): ReactNode {
  const { notices, dismissNotice } = useGame();
  return <div className="fixed bottom-20 right-4 z-[60] grid max-w-sm gap-2" aria-live="polite">{notices.map((notice, index) => <div key={`${notice}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel px-4 py-3 text-sm shadow-card"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => dismissNotice(index)}><X size={16} /></button></div>)}</div>;
}

export function copyText(value: string): void { void navigator.clipboard.writeText(value); }

export function RoomTools({ roomCode }: { roomCode: string }): ReactNode {
  const [sound, setSound] = useState(false); const [animations, setAnimations] = useState(() => localStorage.getItem('animations') !== 'off');
  useEffect(() => { document.documentElement.dataset.animations = animations ? 'on' : 'off'; localStorage.setItem('animations', animations ? 'on' : 'off'); }, [animations]);
  return <div className="flex flex-wrap items-center gap-1"><button className="tool-button" onClick={() => copyText(roomCode)} aria-label="Copy room code"><Copy size={16} /></button><button className="tool-button" onClick={() => setSound((value) => !value)} aria-label={sound ? 'Mute sounds' : 'Enable sounds'}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button><button className="tool-button" onClick={() => setAnimations((value) => !value)} aria-label="Toggle animations"><Settings size={16} /></button></div>;
}

export function ChatDrawer(): ReactNode {
  const { chats, sendChat, session } = useGame(); const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [muted, setMuted] = useState(false);
  const submit = (): void => { const value = message.trim(); if (value === '') return; setMessage(''); void sendChat(value); };
  return <><button className="fixed bottom-4 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-gold px-4 font-semibold text-ink shadow-card focus-visible:ring-2 focus-visible:ring-white" onClick={() => setOpen(true)}><MessageCircle size={19} /> Chat</button>{open && <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-ink shadow-table" aria-label="Room chat"><header className="flex items-center justify-between border-b border-white/10 p-4"><div><h2 className="font-semibold">Room chat</h2><p className="text-xs text-muted">Plain text · messages are separate from game actions</p></div><button className="tool-button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button></header><div className="flex-1 space-y-3 overflow-auto p-4" aria-live="polite">{muted ? <p className="text-sm text-muted">Chat is muted locally.</p> : chats.map((chat) => <div key={chat.id} className={chat.playerId === session?.playerId ? 'text-right' : ''}><p className="text-xs text-gold">{chat.displayName} · {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p><p className="mt-1 inline-block max-w-[90%] rounded-xl bg-white/5 px-3 py-2 text-sm break-words">{chat.message}</p></div>)}</div><div className="border-t border-white/10 p-3"><div className="flex gap-2"><Input value={message} maxLength={300} placeholder="Message friends…" aria-label="Chat message" onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} /><Button onClick={submit}>Send</Button></div><button className="mt-2 text-xs text-muted hover:text-white" onClick={() => setMuted((value) => !value)}>{muted ? 'Unmute chat' : 'Mute chat locally'}</button></div></aside>}</>;
}

export function EmptyState({ children }: { children: ReactNode }): ReactNode { return <main className="mx-auto max-w-xl px-4 py-20"><Panel className="text-center">{children}</Panel></main>; }
