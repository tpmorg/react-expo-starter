import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import type { FontSource } from 'expo-font';
import { useBootStep } from './BootGate';

/** Children mount under the boot overlay; a font error falls back to system fonts. */
export function FontGate({ children, fonts, step = 'fonts', onError }: React.PropsWithChildren<{
  fonts: Record<string, FontSource>; step?: string; onError?: (error: unknown) => void;
}>) {
  const [loaded, error] = useFonts(fonts);
  useBootStep(step, loaded || Boolean(error));
  useEffect(() => { if (error) onError?.(error); }, [error, onError]);
  return children;
}
