import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const production = {
  NODE_ENV: 'production', PORT: '3001', DATABASE_URL: 'postgresql://user:password@example.com:5432/database',
  CLIENT_ORIGINS: 'https://owner.github.io', SESSION_SECRET: 's'.repeat(32), ROOM_TOKEN_PEPPER: 'p'.repeat(32),
  ROOM_TTL_HOURS: '24', LOG_LEVEL: 'info',
};

describe('environment validation', () => {
  it('parses exact production origins and non-placeholder secrets', () => {
    const config = loadConfig(production);
    expect(config.clientOrigins).toEqual(['https://owner.github.io']); expect(config.databaseUrl).toContain('example.com');
  });

  it('refuses local default secrets in production', () => {
    expect(() => loadConfig({ ...production, SESSION_SECRET: 'local-only-session-secret-32-characters' })).toThrow('production SESSION_SECRET');
    expect(() => loadConfig({ ...production, ROOM_TOKEN_PEPPER: 'local-only-room-pepper-32-characters' })).toThrow('production ROOM_TOKEN_PEPPER');
  });
});
