import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

export interface SplashController { hide(): Promise<void> }
/** Call once from the product entry point, before React mounts. No import-time native effects. */
export function holdNativeSplash(safetyMs = 6000): SplashController {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
  let hidden = false;
  let timer: ReturnType<typeof setTimeout>;
  const controller = {
    async hide() {
      if (hidden) return;
      hidden = true; clearTimeout(timer);
      await SplashScreen.hideAsync().catch(() => undefined);
    }
  };
  timer = setTimeout(() => { void controller.hide(); }, safetyMs);
  return controller;
}
const Context = createContext<((step: string) => void) | null>(null);
export function useBootStep(step: string, done: boolean) {
  const mark = useContext(Context);
  useEffect(() => { if (done) mark?.(step); }, [step, done, mark]);
}
export function BootGate({ children, steps, splash, timeoutMs = 6000, renderOverlay }: React.PropsWithChildren<{
  steps: readonly string[]; splash?: SplashController; timeoutMs?: number;
  renderOverlay?: (props: { ready: boolean; finish(): void }) => React.ReactNode;
}>) {
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const [expired, setExpired] = useState(false);
  const [finished, setFinished] = useState(false);
  const [layout, setLayout] = useState(false);
  const mark = useCallback((step: string) => setDone(old => old.has(step) ? old : new Set([...old, step])), []);
  const finish = useCallback(() => setFinished(true), []);
  const ready = steps.every(step => done.has(step));
  useEffect(() => { const timer = setTimeout(() => setExpired(true), timeoutMs); return () => clearTimeout(timer); }, [timeoutMs]);
  useEffect(() => { if ((ready && layout) || expired) void splash?.hide(); }, [ready, layout, expired, splash]);
  return <Context.Provider value={mark}><View style={{ flex: 1 }} onLayout={() => setLayout(true)}>
    {children}
    {!finished && !expired && renderOverlay?.({ ready, finish })}
  </View></Context.Provider>;
}
