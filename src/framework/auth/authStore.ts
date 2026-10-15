import type { AuthGateway, AuthState, AuthTokenProvider, SessionUser } from '../contracts';

export class AuthStore implements AuthTokenProvider {
  private state: AuthState = { status: 'loading', user: null };
  private listeners = new Set<(state: AuthState) => void>();
  private unsubscribeGateway: (() => void) | null = null;

  constructor(private readonly gateway: AuthGateway) {}

  start(): void {
    if (this.unsubscribeGateway) return;
    this.applyUser(this.gateway.getCurrentUser());
    this.unsubscribeGateway = this.gateway.subscribe((user) => this.applyUser(user));
  }

  stop(): void {
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

  signOut(): Promise<void> {
    return this.gateway.signOut();
  }

  private applyUser(user: SessionUser | null): void {
    this.state = user
      ? { status: 'authenticated', user }
      : { status: 'anonymous', user: null };
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
