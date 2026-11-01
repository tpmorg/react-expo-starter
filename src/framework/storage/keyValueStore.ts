import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValuePort } from './ports';
import type { ErrorReporter } from '../contracts';

export class KeyValueStore implements KeyValuePort {
  constructor(private readonly namespace: string, private readonly reporter?: ErrorReporter) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(this.scoped(key));
    if (value === null) return null;
    try { return JSON.parse(value) as T; }
    catch {
      // Never include the value or key: either may contain private app data.
      this.reporter?.captureException(new Error('Stored preference is invalid JSON.'), { operation: 'preferences.parse' });
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(this.scoped(key), JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.scoped(key));
  }

  async clearNamespace(): Promise<void> {
    const prefix = `${this.namespace}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  }

  private scoped(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

