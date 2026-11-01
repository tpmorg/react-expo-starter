import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';

/** Accept an initialized, app-owned FirebaseApp; never select another app implicitly. */
export function initializeFirebaseAuth(app: FirebaseApp) {
  try { return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
}
