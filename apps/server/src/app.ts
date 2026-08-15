import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { Server as SocketServer } from 'socket.io';
import type { Config } from './config.js';
import { RoomManager } from './room-manager.js';
import type { RoomRepository } from './repository.js';
import { registerSocketHandlers } from './socket.js';

export interface Application {
  app: Express;
  httpServer: HttpServer;
  io: SocketServer;
  manager: RoomManager;
  setStopping(value: boolean): void;
}

export function createApplication(config: Config, repository: RoomRepository): Application {
  const logger = pino({ level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.x-reconnect-token'] });
  const app = express();
  const httpServer = createHttpServer(app);
  let stopping = false;
  const originAllowed = (origin: string | undefined): boolean => origin === undefined || config.clientOrigins.includes(origin);
  const corsOptions: cors.CorsOptions = {
    credentials: false,
    origin(origin, callback) { callback(originAllowed(origin) ? null : new Error('Origin is not allowed.'), originAllowed(origin)); },
  };
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(pinoHttp({ logger }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '16kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/health', (_request, response) => response.status(stopping ? 503 : 200).json({ status: stopping ? 'shutting_down' : 'ok', time: new Date().toISOString() }));
  const manager = new RoomManager(repository, config);
  app.get('/api/rooms/:roomId/audit', async (request, response, next) => {
    try {
      const playerId = request.header('x-player-id'); const token = request.header('x-reconnect-token');
      if (playerId === undefined || token === undefined) { response.status(401).json({ code: 'INVALID_RECONNECT_TOKEN', message: 'Player verification is required.' }); return; }
      const audits = await manager.sessionAudit(request.params.roomId ?? '', playerId, token);
      response.setHeader('Cache-Control', 'private, no-store'); response.json({ roomId: request.params.roomId, audits });
    } catch (error) { next(error); }
  });
  app.use((_request, response) => response.status(404).json({ code: 'NOT_FOUND', message: 'Route not found.' }));
  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;
    logger.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'request_rejected');
    response.status(400).json({ code: 'REQUEST_REJECTED', message: 'The request could not be accepted.' });
  });

  const io = new SocketServer(httpServer, { cors: corsOptions, maxHttpBufferSize: 16 * 1024, transports: ['websocket', 'polling'] });
  registerSocketHandlers(io, manager, () => stopping);
  return { app, httpServer, io, manager, setStopping(value) { stopping = value; } };
}
