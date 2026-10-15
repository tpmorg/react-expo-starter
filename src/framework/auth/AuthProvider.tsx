import React, { createContext, useContext, useEffect, useState } from 'react';

import type { AuthState } from '../contracts';
import { AuthStore } from './authStore';

interface AuthContextValue {
  state: AuthState;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ store, children }: React.PropsWithChildren<{ store: AuthStore }>) {
  const [state, setState] = useState<AuthState>(store.getSnapshot());

  useEffect(() => {
    store.start();
    const unsubscribe = store.subscribe(setState);
    return () => {
      unsubscribe();
      store.stop();
    };
  }, [store]);

  return (
    <AuthContext.Provider value={{ state, signOut: () => store.signOut() }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

