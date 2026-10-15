import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from 'firebase/auth';

import type { AuthGateway, SessionUser } from '../contracts';

export class FirebaseAuthGateway implements AuthGateway {
  constructor(private readonly auth: Auth) {}

  getCurrentUser(): SessionUser | null {
    return mapUser(this.auth.currentUser);
  }

  subscribe(listener: (user: SessionUser | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(mapUser(user)));
  }

  async getToken(forceRefresh = false): Promise<string | null> {
    const user = this.auth.currentUser;
    return user ? user.getIdToken(forceRefresh) : null;
  }

  signOut(): Promise<void> {
    return firebaseSignOut(this.auth);
  }
}

function mapUser(user: User | null): SessionUser | null {
  if (!user) return null;
  return {
    id: user.uid,
    email: user.email ?? undefined,
    displayName: user.displayName ?? undefined
  };
}

