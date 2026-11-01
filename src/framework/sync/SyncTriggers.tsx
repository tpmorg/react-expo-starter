import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNetwork } from '../network/NetworkProvider';
import { isOnline } from '../network/networkMonitor';

export interface SyncTriggerOptions {
  ownerId: string | null;
  run(ownerId: string): Promise<unknown>;
  intervalMs?: number;
  onError?(error: unknown): void;
}
/** Foreground policy only. Background execution requires a product's native task policy. */
export function useSyncTriggers(options: SyncTriggerOptions): () => Promise<void> {
  const online = isOnline(useNetwork());
  const current = useRef({ ...options, online });
  current.current = { ...options, online };
  const runs = useRef(new Map<string, Promise<void>>());
  const run = useCallback((): Promise<void> => {
    const value = current.current;
    if (!value.ownerId || !value.online || (AppState.currentState && AppState.currentState !== 'active')) return Promise.resolve();
    const owner = value.ownerId;
    const active = runs.current.get(owner);
    if (active) return active;
    const pending = Promise.resolve().then(() => {
      if (current.current.ownerId !== owner || !current.current.online) return;
      return value.run(owner);
    }).then(() => undefined)
      .catch(error => { value.onError?.(error); }).finally(() => runs.current.delete(owner));
    runs.current.set(owner, pending); return pending;
  }, []);
  useEffect(() => { void run(); }, [options.ownerId, online, run]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void run(); });
    const interval = options.intervalMs ?? 60_000;
    const timer = interval > 0 ? setInterval(() => { void run(); }, interval) : null;
    return () => { listener.remove(); if (timer) clearInterval(timer); };
  }, [options.intervalMs, run]);
  return run;
}
export function SyncTriggers(options: SyncTriggerOptions) { useSyncTriggers(options); return null; }
