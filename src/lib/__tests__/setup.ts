// Vitest setup for crypto.ts tests (environment: node).
//
// crypto.ts needs three browser facilities beyond WebCrypto (which Node 20+
// provides natively on globalThis.crypto):
//   • indexedDB    — provided by fake-indexeddb. Node's native structuredClone
//                    round-trips CryptoKey objects (including the non-extractable
//                    flag), which is exactly what the production code relies on.
//   • localStorage / sessionStorage — minimal in-memory Storage shims below.
//     (Node 24 has no webstorage globals by default, so plain assignment is safe.)
//
// `window` is intentionally NOT defined: crypto.ts only touches it inside
// rumTrack(), which swallows the ReferenceError in a try/catch — locking in
// that the module works without a window object.

import 'fake-indexeddb/auto';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

(globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
(globalThis as Record<string, unknown>).sessionStorage = new MemoryStorage();
