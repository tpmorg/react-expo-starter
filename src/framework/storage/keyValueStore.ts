import AsyncStorage from '@react-native-async-storage/async-storage';

export class KeyValueStore {
  constructor(private readonly namespace: string) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(this.scoped(key));
    return value === null ? null : JSON.parse(value);
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

