import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { KeyValuePort } from '../storage/ports';

export type ThemeName = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeName;
export const DENSE_MAX_FONT_SCALE = 1.5;
export const resolveThemeName = (preference: ThemePreference, system: string | null | undefined): ThemeName =>
  preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference;
export interface ThemeValue<T> {
  name: ThemeName; tokens: T; preference: ThemePreference; ready: boolean;
  setPreference(preference: ThemePreference): void;
}

/** Each app creates its own typed context; the framework owns no product tokens. */
export function createTheme<T>(themes: Record<ThemeName, T>) {
  const Context = createContext<ThemeValue<T> | null>(null);
  function ThemeProvider({ children, store, preferenceKey = 'theme.preference', background, onError }: React.PropsWithChildren<{
    store: KeyValuePort; preferenceKey?: string; background?: (tokens: T) => string; onError?: (error: unknown) => void;
  }>) {
    const system = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>('system');
    const [ready, setReady] = useState(false);
    const revision = useRef(0);
    const saves = useRef<Promise<unknown>>(Promise.resolve());
    const errorHandler = useRef(onError); errorHandler.current = onError;
    useEffect(() => {
      let active = true; const started = revision.current;
      setReady(false);
      store.get<unknown>(preferenceKey).then(value => {
        if (active && started === revision.current && ['system', 'light', 'dark'].includes(String(value))) setPreferenceState(value as ThemePreference);
      }).catch(error => errorHandler.current?.(error)).finally(() => { if (active) setReady(true); });
      return () => { active = false; };
    }, [store, preferenceKey]);
    const setPreference = useCallback((value: ThemePreference) => {
      ++revision.current; setPreferenceState(value);
      saves.current = saves.current.catch(() => undefined).then(() => store.set(preferenceKey, value))
        .catch(error => errorHandler.current?.(error));
    }, [store, preferenceKey]);
    const name = resolveThemeName(preference, system);
    const tokens = themes[name];
    const color = background?.(tokens);
    useEffect(() => {
      if (!color || !requireOptionalNativeModule('ExpoSystemUI')) return;
      const systemUI = require('expo-system-ui') as typeof import('expo-system-ui');
      void systemUI.setBackgroundColorAsync(color).catch(error => errorHandler.current?.(error));
    }, [color]);
    const value = useMemo(() => ({ name, tokens, preference, ready, setPreference }), [name, tokens, preference, ready, setPreference]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }
  function FixedThemeProvider({ name = 'light', children }: React.PropsWithChildren<{ name?: ThemeName }>) {
    const value = useMemo(() => ({ name, tokens: themes[name], preference: name, ready: true, setPreference: () => undefined }), [name]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }
  function useTheme() {
    const value = useContext(Context);
    if (!value) throw new Error('Missing ThemeProvider.');
    return value;
  }
  return { ThemeProvider, FixedThemeProvider, useTheme };
}
