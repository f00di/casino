import { readFile } from 'node:fs/promises';
import { calculateCommitment } from '../src/audit.js';

interface AuditEntry { commitment: string; nonce: string; canonicalOrder: string }
function isAuditEntry(value: unknown): value is AuditEntry {
  return typeof value === 'object' && value !== null &&
    typeof Reflect.get(value, 'commitment') === 'string' &&
    typeof Reflect.get(value, 'nonce') === 'string' &&
    typeof Reflect.get(value, 'canonicalOrder') === 'string';
}
const filename = process.argv[2];
if (filename === undefined) {
  console.error('Usage: npm run verify:audit -- path/to/session-audit.json');
  process.exitCode = 1;
} else {
  const parsed: unknown = JSON.parse(await readFile(filename, 'utf8'));
  const candidates: unknown[] = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && Array.isArray(Reflect.get(parsed, 'audits')) ? Reflect.get(parsed, 'audits') as unknown[] : [];
  const entries = candidates.filter(isAuditEntry);
  let valid = true;
  for (const [index, entry] of entries.entries()) {
    const calculated = calculateCommitment(entry.nonce, entry.canonicalOrder);
    const matches = calculated === entry.commitment;
    console.log(`${index + 1}: ${matches ? 'valid' : 'INVALID'} ${entry.commitment}`);
    valid &&= matches;
  }
  if (!valid || entries.length === 0) process.exitCode = 1;
}
