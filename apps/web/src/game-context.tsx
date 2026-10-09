import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ActionResult,
  ChatMessage,
  CreateRoomInput,
  JoinRoomInput,
  JoinResult,
  RoomSettings,
  RoomSnapshot,
} from "@friendly-card-room/shared";
import type { AppState, GameView, StoredSession } from "./types.js";
import { clientActionId } from "./lib.js";

const STORAGE_KEY = "friendly-card-room:session";
// CI passes an empty string when the VITE_API_URL repo variable is unset.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || undefined;
// Only fall back to a local server in development. A production build without
// VITE_API_URL (e.g. GitHub Pages before the server is deployed) must not make
// visitors' browsers connect to their own localhost.
const SERVER_URL = API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : undefined);

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "unavailable"
  | "not-configured";
interface ContextValue extends AppState {
  socket: Socket;
  connection: ConnectionState;
  notices: string[];
  chats: ChatMessage[];
  createRoom(input: CreateRoomInput): Promise<ActionResult<JoinResult>>;
  joinRoom(input: JoinRoomInput): Promise<ActionResult<JoinResult>>;
  setReady(ready: boolean): Promise<ActionResult>;
  updateSettings(settings: RoomSettings): Promise<ActionResult>;
  leavePermanently(): Promise<ActionResult>;
  startGame(): Promise<ActionResult>;
  pokerAction(action: Record<string, unknown>): Promise<ActionResult>;
  blackjackBet(credits: number, sitOut?: boolean): Promise<ActionResult>;
  blackjackInsurance(take: boolean, credits?: number): Promise<ActionResult>;
  blackjackAction(action: string): Promise<ActionResult>;
  nextPokerHand(): Promise<ActionResult>;
  nextBlackjackRound(): Promise<ActionResult>;
  endSession(): Promise<ActionResult>;
  downloadAudit(): Promise<ActionResult>;
  sendChat(message: string): Promise<ActionResult>;
  retry(): void;
  clearSession(): void;
  dismissNotice(index: number): void;
}

function storedSession(): StoredSession | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? undefined : (JSON.parse(value) as StoredSession);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

const socket = io(SERVER_URL ?? "http://localhost:3001", {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.4,
  timeout: 8_000,
});
const GameContext = createContext<ContextValue | undefined>(undefined);

function emit<T>(event: string, payload: unknown): Promise<ActionResult<T>> {
  return new Promise((resolve) => {
    socket
      .timeout(10_000)
      .emit(
        event,
        payload,
        (error: Error | null, response: ActionResult<T>) => {
          if (error !== null)
            resolve({
              ok: false,
              code: "INTERNAL_ERROR",
              message: "The server did not respond in time.",
              stateVersion: 0,
            });
          else resolve(response);
        },
      );
  });
}

export function GameProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<AppState>(() => {
    const session = storedSession();
    return session === undefined ? {} : { session };
  });
  const [connection, setConnection] = useState<ConnectionState>(
    SERVER_URL === undefined ? "not-configured" : "connecting",
  );
  const [notices, setNotices] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const notify = useCallback(
    (message: string) => setNotices((values) => [...values.slice(-3), message]),
    [],
  );

  useEffect(() => {
    const onConnect = (): void => {
      setConnection("connected");
      const session = storedSession();
      if (session === undefined) return;
      void emit<{ room: RoomSnapshot; game?: GameView }>(
        "room:reconnect",
        session,
      ).then((result) => {
        if (result.ok && result.data !== undefined) {
          setState({
            session,
            room: result.data.room,
            ...(result.data.game === undefined
              ? {}
              : { game: result.data.game }),
          });
          notify("Successfully reconnected.");
        } else if (
          result.code === "INVALID_RECONNECT_TOKEN" ||
          result.code === "ROOM_NOT_FOUND"
        ) {
          localStorage.removeItem(STORAGE_KEY);
          setState({});
          notify(result.message);
        }
      });
    };
    const onDisconnect = (): void =>
      setConnection(socket.active ? "reconnecting" : "offline");
    const onError = (): void => setConnection("unavailable");
    const onRoom = (room: RoomSnapshot): void =>
      setState((value) => ({ ...value, room }));
    const onGame = (game: GameView): void =>
      setState((value) => ({ ...value, game }));
    const onChat = (message: ChatMessage): void =>
      setChats((values) => [...values.slice(-99), message]);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.on("room:snapshot", onRoom);
    socket.on("game:snapshot", onGame);
    socket.on("room:chat", onChat);
    if (SERVER_URL !== undefined) socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.off("room:snapshot", onRoom);
      socket.off("game:snapshot", onGame);
      socket.off("room:chat", onChat);
    };
  }, [notify]);

  const acceptJoin = useCallback(
    (result: ActionResult<JoinResult>): ActionResult<JoinResult> => {
      if (result.ok && result.data !== undefined) {
        const session = {
          roomId: result.data.room.roomId,
          playerId: result.data.playerId,
          reconnectToken: result.data.reconnectToken,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setState({ session, room: result.data.room });
      } else notify(result.message);
      return result;
    },
    [notify],
  );

  const withSession = useCallback(
    async (
      event: string,
      data: Record<string, unknown>,
    ): Promise<ActionResult> => {
      if (state.session === undefined || state.room === undefined)
        return {
          ok: false,
          code: "INVALID_RECONNECT_TOKEN",
          message: "No active player session.",
          stateVersion: 0,
        };
      const result = await emit(event, {
        clientActionId: clientActionId(),
        roomId: state.session.roomId,
        playerId: state.session.playerId,
        expectedStateVersion: state.room.stateVersion,
        ...data,
      });
      if (!result.ok) notify(result.message);
      return result;
    },
    [notify, state.room, state.session],
  );

  const value = useMemo<ContextValue>(
    () => ({
      ...state,
      socket,
      connection,
      notices,
      chats,
      createRoom: async (input) => acceptJoin(await emit("room:create", input)),
      joinRoom: async (input) => acceptJoin(await emit("room:join", input)),
      setReady: (ready) => withSession("room:setReady", { ready }),
      updateSettings: (settings) =>
        withSession("room:updateSettings", { settings }),
      leavePermanently: async () => {
        const result = await withSession("room:leave", { permanent: true });
        if (result.ok) {
          localStorage.removeItem(STORAGE_KEY);
          setState({});
          setChats([]);
        }
        return result;
      },
      startGame: () => withSession("room:start", {}),
      pokerAction: (action) => withSession("poker:action", { action }),
      blackjackBet: (credits, sitOut = false) =>
        withSession("blackjack:placeBet", {
          amount: Math.round(credits * 2),
          sitOut,
        }),
      blackjackInsurance: (take, credits = 0) =>
        withSession("blackjack:insurance", {
          take,
          amount: Math.round(credits * 2),
        }),
      blackjackAction: (action) =>
        withSession("blackjack:action", { action: { type: action } }),
      nextPokerHand: () => withSession("poker:nextHand", {}),
      nextBlackjackRound: () => withSession("blackjack:nextRound", {}),
      endSession: () => withSession("session:end", {}),
      downloadAudit: async () => {
        if (state.session === undefined || state.room === undefined)
          return {
            ok: false,
            code: "INVALID_RECONNECT_TOKEN",
            message: "No completed session is available.",
            stateVersion: 0,
          };
        const response = await fetch(
          `${SERVER_URL ?? ""}/api/rooms/${state.session.roomId}/audit`,
          {
            headers: {
              "x-player-id": state.session.playerId,
              "x-reconnect-token": state.session.reconnectToken,
            },
            cache: "no-store",
          },
        );
        if (!response.ok) {
          const failure = (await response.json()) as { message?: string };
          const result: ActionResult = {
            ok: false,
            code: "INVALID_ACTION",
            message: failure.message ?? "The audit could not be downloaded.",
            stateVersion: state.room.stateVersion,
          };
          notify(result.message);
          return result;
        }
        const data: unknown = await response.json();
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${state.room.roomCode}-session-audit.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        return {
          ok: true,
          message: "Session audit downloaded.",
          stateVersion: state.room.stateVersion,
        };
      },
      sendChat: (message) => withSession("room:chat", { message }),
      retry: () => {
        if (SERVER_URL === undefined) return;
        setConnection("connecting");
        socket.connect();
      },
      clearSession: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState({});
        setChats([]);
      },
      dismissNotice: (index) =>
        setNotices((values) => values.filter((_, item) => item !== index)),
    }),
    [acceptJoin, chats, connection, notices, notify, state, withSession],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): ContextValue {
  const context = useContext(GameContext);
  if (context === undefined)
    throw new Error("useGame must be used inside GameProvider.");
  return context;
}
