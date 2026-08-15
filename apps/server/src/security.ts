import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { ROOM_CODE_ALPHABET } from '@friendly-card-room/shared';

const scrypt = promisify(scryptCallback);

export function secureId(): string { return randomUUID(); }
export function generateReconnectToken(): string { return randomBytes(32).toString('base64url'); }
export function hashReconnectToken(token: string, pepper: string): string {
  return createHash('sha256').update(pepper, 'utf8').update(token, 'utf8').digest('hex');
}
export function reconnectTokenMatches(raw: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashReconnectToken(raw, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)]).join('');
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split(':');
  if (algorithm !== 'scrypt' || saltHex === undefined || hashHex === undefined) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
