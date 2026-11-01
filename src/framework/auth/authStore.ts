import type { AuthGateway, AuthState, AuthTokenProvider, SessionUser } from '../contracts';

export class AuthStore implements AuthTokenProvider {
  private state: AuthState = { status: 'loading', user: null };
  private listeners = new Set<(state: AuthState) => void>();
  private unsubscribeGateway: (() => void) | null = null;
  private epoch = 0;

  constructor(private readonly gateway: AuthGateway) {}

  start(): void {
    if (this.unsubscribeGateway) return;
    const epoch = ++this.epoch;
    const current = this.gateway.getCurrentUser();
    // null may mean persistence is still restoring. Only the first callback is definitive.
    if (current) this.applyUser(current);
    else this.publish({ status: 'loading', user: null });
    this.unsubscribeGateway = this.gateway.subscribe((user) => {
      if (epoch === this.epoch) this.applyUser(user);
    });
  }

  stop(): void {
    ++this.epoch;
    this.unsubscribeGateway?.();
    this.unsubscribeGateway = null;
  }

  getSnapshot(): AuthState {
    return this.state;
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getToken(forceRefresh = false): Promise<string | null> {
    return this.gateway.getToken(forceRefresh);
  }

  getOwnerId(): string | null { return this.state.user?.id ?? null; }
  getSessionEpoch(): number { return this.epoch; }

  signOut(): Promise<void> {
    return this.gateway.signOut();
  }

  private applyUser(user: SessionUser | null): void {
    if (this.state.user?.id !== user?.id) ++this.sessionRevision;
    this.publish(user
      ? { status: 'authenticated', user }
      : { status: 'anonymous', user: null });
  }
  private sessionRevision = 0;
  getSessionRevision(): number { return this.sessionRevision; }

  private publish(state: AuthState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export class GuestAuthGateway implements AuthGateway {
  getCurrentUser(): null { return null; }
  subscribe(listener: (user: SessionUser | null) => void): () => void {
    listener(null); return () => undefined;
  }
  async getToken(): Promise<null> { return null; }
  async signOut(): Promise<void> {}
}
