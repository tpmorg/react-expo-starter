import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createTheme, type ThemeValue } from '../ThemeProvider';
import { memoryStore } from '../../testing/memoryStore';
jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
test('does not let a late saved preference overwrite a newer selection', async () => {
  let resolve!: (value: unknown) => void;
  const underlying = memoryStore();
  const store = { ...underlying, get: <T,>() => new Promise<T | null>(r => { resolve = value => r(value as T | null); }) };
  const { ThemeProvider, useTheme } = createTheme({ light: { bg: '#FFFFFF' }, dark: { bg: '#000000' } });
  let value!: ThemeValue<{ bg: string }>;
  function Probe() { value = useTheme(); return null; }
  let root!: ReactTestRenderer;
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(async () => { root = create(<ThemeProvider store={store}><Probe /></ThemeProvider>); });
    expect(value.ready).toBe(false);
    await act(async () => { value.setPreference('dark'); });
    await act(async () => { resolve('light'); });
    expect(value).toMatchObject({ preference: 'dark', ready: true, tokens: { bg: '#000000' } });
    await expect(underlying.get('theme.preference')).resolves.toBe('dark');
  } finally { await act(async () => root.unmount()); warn.mockRestore(); }
});
