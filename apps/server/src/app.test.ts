import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from './config.js';
import { createApplication, type Application } from './app.js';
import { MemoryRoomRepository } from './repository.js';

const config: Config = { nodeEnv: 'test', port: 3001, clientOrigins: ['http://localhost:5173'], sessionSecret: 's'.repeat(32), tokenPepper: 'p'.repeat(32), roomTtlHours: 24, logLevel: 'silent' };
let application: Application | undefined;
afterEach(() => { void application?.io.close(); application?.httpServer.close(); application = undefined; });

describe('HTTP server', () => {
  it('exposes a safe health endpoint and security headers', async () => {
    application = createApplication(config, new MemoryRoomRepository());
    const response = await request(application.app).get('/health').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200); expect(response.body.status).toBe('ok');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects unapproved browser origins with a safe error', async () => {
    application = createApplication(config, new MemoryRoomRepository());
    const response = await request(application.app).get('/health').set('Origin', 'https://evil.example');
    expect(response.status).toBe(400); expect(response.body.code).toBe('REQUEST_REJECTED');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
