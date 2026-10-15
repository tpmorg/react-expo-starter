import React, { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BillingStore, type BillingStoreState } from './billingStore';

interface BillingContextValue {
  state: BillingStoreState;
  refresh(): Promise<void>;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ store, children }: React.PropsWithChildren<{ store: BillingStore }>) {
  const { state: authState } = useAuth();
  const [state, setState] = useState(store.getSnapshot());

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    const ownerId = authState.user?.id;
    if (ownerId) {
      void store.start(ownerId);
    } else {
      void store.stop();
    }
    return () => { void store.stop(); };
  }, [authState.user?.id, store]);

  return (
    <BillingContext.Provider value={{ state, refresh: async () => { await store.refresh(); } }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const value = useContext(BillingContext);
  if (!value) throw new Error('useBilling must be used inside BillingProvider.');
  return value;
}
