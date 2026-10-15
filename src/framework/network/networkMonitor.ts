import NetInfo from '@react-native-community/netinfo';

import type { NetworkState } from '../contracts';

const initialState: NetworkState = {
  isConnected: null,
  isInternetReachable: null,
  connectionType: 'unknown'
};

export class NetworkMonitor {
  private state = initialState;
  private listeners = new Set<(state: NetworkState) => void>();
  private unsubscribeNative: (() => void) | null = null;

  start(): void {
    if (this.unsubscribeNative) return;
    this.unsubscribeNative = NetInfo.addEventListener((next) => {
      this.state = {
        isConnected: next.isConnected,
        isInternetReachable: next.isInternetReachable,
        connectionType: next.type
      };
      this.listeners.forEach((listener) => listener(this.state));
    });
  }

  stop(): void {
    this.unsubscribeNative?.();
    this.unsubscribeNative = null;
  }

  getSnapshot(): NetworkState {
    return this.state;
  }

  subscribe(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

