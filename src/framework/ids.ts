import * as Crypto from 'expo-crypto';

export interface IdFactory {
  create(): string;
}

export const uuidFactory: IdFactory = {
  create: () => Crypto.randomUUID()
};

