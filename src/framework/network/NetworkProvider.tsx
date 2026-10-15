import React, { createContext, useContext, useEffect, useState } from 'react';

import type { NetworkState } from '../contracts';
import { NetworkMonitor } from './networkMonitor';

const NetworkContext = createContext<NetworkState | null>(null);

export function NetworkProvider({ monitor, children }: React.PropsWithChildren<{ monitor: NetworkMonitor }>) {
  const [state, setState] = useState(monitor.getSnapshot());

  useEffect(() => {
    monitor.start();
    const unsubscribe = monitor.subscribe(setState);
    return () => {
      unsubscribe();
      monitor.stop();
    };
  }, [monitor]);

  return <NetworkContext.Provider value={state}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const value = useContext(NetworkContext);
  if (!value) throw new Error('useNetwork must be used inside NetworkProvider.');
  return value;
}

