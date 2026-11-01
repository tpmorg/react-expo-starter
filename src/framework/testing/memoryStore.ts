import type { KeyValuePort } from '../storage/ports';
export function memoryStore(): KeyValuePort {
  const values = new Map<string, string>();
  return {
    get: async <T>(key: string) => values.has(key) ? JSON.parse(values.get(key)!) as T : null,
    set: async (key, value) => { values.set(key, JSON.stringify(value)); },
    remove: async key => { values.delete(key); }
  };
}
