import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().url().startsWith('postgresql://').optional(),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(32).default('local-only-session-secret-32-characters'),
  ROOM_TOKEN_PEPPER: z.string().min(32).default('local-only-room-pepper-32-characters'),
  ROOM_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl?: string;
  clientOrigins: string[];
  sessionSecret: string;
  tokenPepper: string;
  roomTtlHours: number;
  logLevel: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(environment);
  if (parsed.NODE_ENV === 'production' && parsed.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required in production.');
  if (parsed.NODE_ENV === 'production' && parsed.SESSION_SECRET.startsWith('local-only')) throw new Error('A production SESSION_SECRET is required.');
  if (parsed.NODE_ENV === 'production' && parsed.ROOM_TOKEN_PEPPER.startsWith('local-only')) throw new Error('A production ROOM_TOKEN_PEPPER is required.');
  return {
    nodeEnv: parsed.NODE_ENV, port: parsed.PORT,
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    clientOrigins: parsed.CLIENT_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
    sessionSecret: parsed.SESSION_SECRET, tokenPepper: parsed.ROOM_TOKEN_PEPPER,
    roomTtlHours: parsed.ROOM_TTL_HOURS, logLevel: parsed.LOG_LEVEL,
  };
}
