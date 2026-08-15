import { ChevronUp, History, Minus, Plus } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useGame } from "../game-context.js";
import { formatNumber } from "../lib.js";
import type { PokerPlayerView, PokerView } from "../types.js";
import { PlayingCard } from "../components/card.js";
import { ChatDrawer, RoomTools } from "../components/chrome.js";
import { Button, Dialog, Input } from "../components/ui.js";

export function PokerPage({ game }: { game: PokerView }): ReactNode {
  const { room, session, pokerAction, nextPokerHand } = useGame();
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  if (room === undefined || session === undefined) return null;
  const me = game.players.find((player) => player.id === session.playerId);
  const names = new Map(
    room.players.map((player) => [player.id, player.displayName]),
  );
  const pot = game.players.reduce(
    (sum, player) => sum + player.totalContribution,
    0,
  );
  return (
    <main className="min-h-[calc(100vh-57px)] overflow-hidden px-2 py-3 sm:px-4">
      <div className="mx-auto mb-2 flex max-w-7xl items-center justify-between px-2">
        <div>
          <span className="text-xs uppercase tracking-widest text-gold">
            Hand {game.handNumber}
          </span>
          <span className="ml-3 text-xs capitalize text-muted">
            {game.street}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="tool-button"
            aria-label="Open hand history"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={17} />
          </button>
          <RoomTools roomCode={room.roomCode} />
        </div>
      </div>
      <section className="poker-table mx-auto" aria-label="Texas Hold'em table">
        <div className="table-rail" />
        <div className="absolute inset-0">
          <div className="board-center">
            <div className="mb-2 flex min-h-16 justify-center gap-1 sm:min-h-24 sm:gap-2">
              {game.communityCards.map((card) => (
                <PlayingCard key={card.physicalId} card={card} small />
              ))}
              {Array.from(
                { length: 5 - game.communityCards.length },
                (_, index) => (
                  <div
                    key={index}
                    className="h-16 w-11 rounded-md border border-white/10 sm:h-20 sm:w-14"
                  />
                ),
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/60">
                Total pot
              </p>
              <p className="font-semibold text-cream">
                {formatNumber(pot)} chips
              </p>
              {game.awards.length > 1 && (
                <p className="text-xs text-gold">
                  {game.awards.length - 1} side pot
                  {game.awards.length > 2 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
          {game.players.map((player) => (
            <Seat
              key={player.id}
              player={player}
              game={game}
              name={names.get(player.id) ?? "Player"}
              isMe={player.id === session.playerId}
              playerCount={game.players.length}
            />
          ))}
        </div>
      </section>
      <div className="mx-auto mt-2 max-w-3xl pb-20 sm:pb-4">
        <div className="mb-2 flex min-h-24 items-end justify-center gap-2">
          {me?.holeCards?.map((card) => (
            <PlayingCard key={card.physicalId} card={card} />
          ))}
        </div>
        <ActionBar
          game={game}
          canAdvance={
            room.players.find((player) => player.id === session.playerId)
              ?.isHost ?? false
          }
          nextHand={() => void nextPokerHand()}
          onRaise={() => setRaiseOpen(true)}
          action={(value) => {
            void pokerAction(value);
          }}
        />
      </div>
      <div className="sr-only" aria-live="polite">
        {game.currentPlayerId === session.playerId
          ? "It is your turn."
          : `${names.get(game.currentPlayerId ?? "") ?? "Another player"} is acting.`}
      </div>
      {raiseOpen && (
        <RaiseDialog
          game={game}
          pot={pot}
          onClose={() => setRaiseOpen(false)}
          onSubmit={(action) => {
            setRaiseOpen(false);
            void pokerAction(action);
          }}
        />
      )}
      {historyOpen && (
        <Dialog title="Hand history" onClose={() => setHistoryOpen(false)}>
          <div className="max-h-80 space-y-2 overflow-auto">
            {game.players
              .filter((player) => player.lastAction !== undefined)
              .map((player) => (
                <p
                  key={player.id}
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm"
                >
                  <span className="text-gold">{names.get(player.id)}</span>{" "}
                  {player.lastAction}
                </p>
              ))}
          </div>
        </Dialog>
      )}
      <ChatDrawer />
    </main>
  );
}

function Seat({
  player,
  game,
  name,
  isMe,
  playerCount,
}: {
  player: PokerPlayerView;
  game: PokerView;
  name: string;
  isMe: boolean;
  playerCount: number;
}): ReactNode {
  const relative = player.seatIndex % playerCount;
  const angle = (relative / playerCount) * Math.PI * 2 + Math.PI / 2;
  const style = {
    "--seat-x": `${50 + 44 * Math.cos(angle)}%`,
    "--seat-y": `${50 + 40 * Math.sin(angle)}%`,
  } as CSSProperties;
  const active = game.currentPlayerId === player.id;
  return (
    <div
      style={style}
      className={`poker-seat ${active ? "is-active" : ""} ${isMe ? "is-me" : ""} ${player.folded ? "opacity-50" : ""}`}
    >
      <div className="mb-1 flex justify-center -space-x-2">
        {player.holeCards?.map((card) => (
          <PlayingCard key={card.physicalId} card={card} small />
        )) ?? (
          <>
            <PlayingCard hidden small />
            <PlayingCard hidden small />
          </>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-ink/95 px-2.5 py-1.5 text-center shadow-card">
        <p className="max-w-24 truncate text-xs font-semibold">{name}</p>
        <p className="text-[11px] text-gold">{formatNumber(player.stack)}</p>
        <p className="h-3 text-[9px] uppercase text-muted">
          {player.allIn
            ? "All-in"
            : player.folded
              ? "Folded"
              : player.lastAction}
        </p>
      </div>
      {player.seatIndex === game.dealerSeat && (
        <span className="seat-token">D</span>
      )}
      {player.seatIndex === game.smallBlindSeat && (
        <span className="blind-token">SB</span>
      )}
      {player.seatIndex === game.bigBlindSeat && (
        <span className="blind-token">BB</span>
      )}
    </div>
  );
}

function ActionBar({
  game,
  action,
  onRaise,
  canAdvance,
  nextHand,
}: {
  game: PokerView;
  action(value: Record<string, unknown>): void;
  onRaise(): void;
  canAdvance: boolean;
  nextHand(): void;
}): ReactNode {
  const legal = game.legalActions;
  const myTurn = legal.fold;
  return (
    <div className="action-bar">
      <Timer deadline={game.deadline} />
      <div className="grid flex-1 grid-cols-3 gap-2 sm:flex">
        {legal.fold && (
          <Button variant="danger" onClick={() => action({ type: "fold" })}>
            Fold
          </Button>
        )}
        {legal.check && (
          <Button variant="secondary" onClick={() => action({ type: "check" })}>
            Check
          </Button>
        )}
        {legal.callAmount !== undefined && (
          <Button variant="secondary" onClick={() => action({ type: "call" })}>
            Call {formatNumber(legal.callAmount)}
          </Button>
        )}
        {(legal.minimumBetTo !== undefined ||
          legal.minimumRaiseTo !== undefined) && (
          <Button onClick={onRaise}>
            {legal.minimumRaiseTo !== undefined ? "Raise to" : "Bet"}{" "}
            <ChevronUp size={15} className="inline" />
          </Button>
        )}
        {legal.allIn && (
          <Button
            variant="secondary"
            onClick={() => action({ type: "all-in" })}
          >
            All-in
          </Button>
        )}
        {!myTurn && (
          game.street === "complete" && canAdvance ? (
            <Button onClick={nextHand}>Deal next hand</Button>
          ) : (
            <p className="col-span-3 px-4 py-3 text-center text-sm text-muted">
              {game.street === "complete"
                ? "Next hand begins shortly…"
                : "Waiting for the next action…"}
            </p>
          )
        )}
      </div>
    </div>
  );
}

function Timer({ deadline }: { deadline: number | undefined }): ReactNode {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  if (deadline === undefined) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div
      className={`timer-ring ${seconds <= 5 ? "text-danger" : "text-gold"}`}
      aria-label={`${seconds} seconds remaining`}
    >
      {seconds}
    </div>
  );
}

function RaiseDialog({
  game,
  pot,
  onClose,
  onSubmit,
}: {
  game: PokerView;
  pot: number;
  onClose(): void;
  onSubmit(action: Record<string, unknown>): void;
}): ReactNode {
  const legal = game.legalActions;
  const minimum = legal.minimumRaiseTo ?? legal.minimumBetTo ?? 0;
  const maximum = legal.maximumTo;
  const [value, setValue] = useState(minimum);
  const clamp = (amount: number): number =>
    Math.min(maximum, Math.max(minimum, Math.round(amount)));
  const quick = [
    { label: "½ pot", value: game.currentBet + pot * 0.5 },
    { label: "75% pot", value: game.currentBet + pot * 0.75 },
    { label: "Pot", value: game.currentBet + pot },
    { label: "All-in", value: maximum },
  ].map((item) => ({ ...item, value: clamp(item.value) }));
  return (
    <Dialog
      title={
        legal.minimumRaiseTo !== undefined
          ? "Raise to total"
          : "Choose bet total"
      }
      onClose={onClose}
    >
      <div className="grid gap-5">
        <div className="flex items-center gap-2">
          <button
            className="tool-button"
            onClick={() => setValue(clamp(value - game.previousFullRaiseSize))}
            aria-label="Decrease raise"
          >
            <Minus size={18} />
          </button>
          <Input
            type="number"
            value={value}
            min={minimum}
            max={maximum}
            onChange={(event) => setValue(clamp(event.target.valueAsNumber))}
            className="text-center text-lg"
            aria-label="Raise to total chips"
          />
          <button
            className="tool-button"
            onClick={() => setValue(clamp(value + game.previousFullRaiseSize))}
            aria-label="Increase raise"
          >
            <Plus size={18} />
          </button>
        </div>
        <input
          type="range"
          min={minimum}
          max={maximum}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="w-full accent-[#d3ad5b]"
          aria-label="Raise amount slider"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>Minimum {formatNumber(minimum)}</span>
          <span>Maximum {formatNumber(maximum)}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {quick.map((item) => (
            <Button
              key={item.label}
              variant="secondary"
              className="px-2 text-xs"
              onClick={() => setValue(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Button
          onClick={() =>
            onSubmit(
              legal.minimumRaiseTo !== undefined
                ? { type: "raise", raiseTo: value }
                : { type: "bet", betTo: value },
            )
          }
        >
          {legal.minimumRaiseTo !== undefined ? "Raise to" : "Bet"}{" "}
          {formatNumber(value)}
        </Button>
      </div>
    </Dialog>
  );
}
