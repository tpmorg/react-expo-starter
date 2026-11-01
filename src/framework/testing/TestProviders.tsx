import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { AuthStore, GuestAuthGateway } from '../auth/authStore';
import { NetworkProvider } from '../network/NetworkProvider';
import type { NetworkMonitor } from '../network/networkMonitor';
import type { NetworkState } from '../contracts';

const offline: NetworkState = { isConnected: false, isInternetReachable: false, connectionType: 'none' };
const monitor = {
  start() {}, stop() {}, getSnapshot: () => offline,
  subscribe(listener: (state: NetworkState) => void) { listener(offline); return () => undefined; }
} as NetworkMonitor;
/** Wrap in the app's FixedThemeProvider for product token types. No real network listeners. */
export function TestProviders({ children, auth }: React.PropsWithChildren<{ auth?: AuthStore }>) {
  const [guest] = React.useState(() => new AuthStore(new GuestAuthGateway()));
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <NetworkProvider monitor={monitor}><AuthProvider store={auth ?? guest}>{children}</AuthProvider></NetworkProvider>
  </SafeAreaProvider>;
}
