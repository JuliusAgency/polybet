import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestUserKey } from './users';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, '..', '.auth');

// The app stores the Supabase auth session in sessionStorage (see
// src/shared/api/supabase/client.ts — hardening from the 2026-06-10 security
// audit). Playwright's storageState() captures cookies + localStorage ONLY,
// so authenticated projects need a parallel snapshot/inject mechanism:
//   * auth.setup.ts calls saveSessionStorage() after the UI login;
//   * authed fixtures call sessionStorageInitScript() to replay the snapshot
//     before any app code runs in a fresh context.

export function sessionStoragePath(role: TestUserKey): string {
  return path.join(STORAGE_DIR, `${role}.session.json`);
}

export async function saveSessionStorage(
  page: import('@playwright/test').Page,
  role: TestUserKey
): Promise<void> {
  const snapshot = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key !== null) out[key] = window.sessionStorage.getItem(key) ?? '';
    }
    return out;
  });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(sessionStoragePath(role), JSON.stringify(snapshot, null, 2));
}

export function readSessionStorage(role: TestUserKey): Record<string, string> {
  return JSON.parse(fs.readFileSync(sessionStoragePath(role), 'utf-8')) as Record<string, string>;
}
