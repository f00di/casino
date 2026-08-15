import {
  Check,
  Clock3,
  Copy,
  Link as LinkIcon,
  LogOut,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useGame } from "../game-context.js";
import { copyText, RoomTools } from "../components/chrome.js";
import { Button, Dialog, Field, Input, Panel } from "../components/ui.js";

export function LobbyPage(): ReactNode {
  const {
    room,
    session,
    setReady,
    startGame,
    leavePermanently,
    updateSettings,
  } = useGame();
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState(false);
  if (room === undefined || session === undefined) return null;
  const me = room.players.find((player) => player.id === session.playerId);
  const allReady =
    room.players.length === room.expectedPlayerCount &&
    room.players.every((player) => player.ready);
  const invite = `${location.origin}${location.pathname}#/join?room=${room.roomCode}`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.25em] text-gold">
            Private {room.gameType} room
          </p>
          <h1 className="mt-1 font-serif text-3xl text-cream">
            Waiting for the table
          </h1>
        </div>
        <RoomTools roomCode={room.roomCode} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users size={18} className="text-gold" /> Players{" "}
              <span className="text-sm font-normal text-muted">
                {room.players.length}/{room.expectedPlayerCount}
              </span>
            </h2>
            {room.countdownEndsAt !== undefined && (
              <Countdown deadline={room.countdownEndsAt} />
            )}
          </div>
          <div className="grid gap-2">
            {Array.from({ length: room.expectedPlayerCount }, (_, index) => {
              const player = room.players.find(
                (candidate) => candidate.seatIndex === index,
              );
              return (
                <div
                  key={index}
                  className="flex min-h-16 items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-felt text-sm font-semibold">
                      {player?.displayName.charAt(0).toUpperCase() ?? index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {player?.displayName ?? "Open seat"}
                      </p>
                      {player !== undefined && (
                        <p className="text-xs text-muted">
                          Seat {index + 1} ·{" "}
                          {player.connected ? "Online" : "Offline"}{" "}
                          {player.isHost ? "· Host" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  {player !== undefined && (
                    <span
                      className={
                        player.ready ? "status-ready" : "status-waiting"
                      }
                    >
                      {player.ready ? (
                        <Check size={14} />
                      ) : (
                        <Clock3 size={14} />
                      )}
                      {player.ready ? "Ready" : "Not ready"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                void setReady(!me?.ready);
              }}
              variant={me?.ready ? "secondary" : "primary"}
            >
              {me?.ready ? "Mark not ready" : "I’m ready"}
            </Button>
            {me?.isHost && (
              <Button
                onClick={() => {
                  void startGame();
                }}
                disabled={!allReady}
              >
                Start game
              </Button>
            )}
            {me?.isHost && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Settings size={16} className="mr-1 inline" /> Settings
              </Button>
            )}
            <Button variant="ghost" onClick={() => setLeaving(true)}>
              <LogOut size={16} className="mr-1 inline" /> Leave
            </Button>
          </div>
          {!allReady && me?.isHost && (
            <p className="mt-3 text-xs text-muted">
              Start unlocks when every expected player has joined and marked
              ready.
            </p>
          )}
        </Panel>
        <div className="grid content-start gap-5">
          <Panel>
            <h2 className="font-semibold">Invite friends</h2>
            <p className="mt-1 text-xs text-muted">
              Passwords and seat tokens never appear in invite links.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
              <span className="font-mono text-xl tracking-[.25em] text-cream">
                {room.roomCode}
              </span>
              <button
                className="tool-button"
                onClick={() => copyText(room.roomCode)}
                aria-label="Copy room code"
              >
                <Copy size={17} />
              </button>
            </div>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              onClick={() => copyText(invite)}
            >
              <LinkIcon size={16} className="mr-2 inline" /> Copy invite link
            </Button>
          </Panel>
          <RulesSummary />
        </div>
      </div>
      {leaving && (
        <Dialog title="Leave this room?" onClose={() => setLeaving(false)}>
          <p className="mb-5 text-sm text-muted">
            You can reconnect to your seat on this device unless the room
            expires. Permanently leaving during a game is not available.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaving(false)}>
              Stay
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void leavePermanently();
              }}
            >
              Leave permanently
            </Button>
          </div>
        </Dialog>
      )}
      {editing && (
        <SettingsDialog
          onClose={() => setEditing(false)}
          onSave={(turnSeconds, autoStart) => {
            setEditing(false);
            void updateSettings({
              ...room.settings,
              turnSeconds,
              autoStart,
            });
          }}
        />
      )}
    </main>
  );
}

function RulesSummary(): ReactNode {
  const { room } = useGame();
  if (room === undefined) return null;
  const poker = room.settings.poker;
  const blackjack = room.settings.blackjack;
  return (
    <Panel>
      <h2 className="flex items-center gap-2 font-semibold">
        <Shield size={17} className="text-gold" /> Room rules
      </h2>
      <dl className="mt-4 grid gap-3 text-sm">
        {room.gameType === "poker" ? (
          <>
            <Rule
              name="Starting stack"
              value={`${poker?.startingBalance.toLocaleString() ?? "10,000"} chips`}
            />
            <Rule
              name="Blinds"
              value={`${poker?.smallBlind ?? 50} / ${poker?.bigBlind ?? 100}`}
            />
            <Rule name="Format" value="No-limit · no rake" />
          </>
        ) : (
          <>
            <Rule
              name="Starting balance"
              value={`${((blackjack?.startingBalance ?? 2000) / 2).toLocaleString()} credits`}
            />
            <Rule
              name="Limits"
              value={`${(blackjack?.minimumBet ?? 20) / 2}–${(blackjack?.maximumBet ?? 1000) / 2} credits`}
            />
            <Rule name="Dealer" value="Stands on soft 17" />
          </>
        )}
        <Rule name="Turn timer" value={`${room.settings.turnSeconds}s`} />
      </dl>
    </Panel>
  );
}

function SettingsDialog({
  onClose,
  onSave,
}: {
  onClose(): void;
  onSave(turnSeconds: number, autoStart: boolean): void;
}): ReactNode {
  const { room } = useGame();
  const [turnSeconds, setTurnSeconds] = useState(
    room?.settings.turnSeconds ?? 30,
  );
  const [autoStart, setAutoStart] = useState(
    room?.settings.autoStart ?? false,
  );
  return (
    <Dialog title="Lobby settings" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Turn timer" hint="10–180 seconds">
          <Input
            type="number"
            min={10}
            max={180}
            value={turnSeconds}
            onChange={(event) => setTurnSeconds(event.target.valueAsNumber)}
          />
        </Field>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-4 text-sm">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(event) => setAutoStart(event.target.checked)}
            className="h-5 w-5 accent-[#d3ad5b]"
          />
          Auto-start when all expected players are ready
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(turnSeconds, autoStart)}>
            Save settings
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
function Rule({ name, value }: { name: string; value: string }): ReactNode {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{name}</dt>
      <dd className="text-right text-gray-200">{value}</dd>
    </div>
  );
}
function Countdown({ deadline }: { deadline: number }): ReactNode {
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  return (
    <span
      className="animate-pulseSoft rounded-full border border-gold/30 px-3 py-1 text-sm text-gold"
      role="status"
    >
      Starting in {seconds}s
    </span>
  );
}
