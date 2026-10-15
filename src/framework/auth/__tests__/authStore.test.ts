import type { AuthGateway, SessionUser } from '../../contracts';
import { AuthStore } from '../authStore';

class FakeGateway implements AuthGateway {
  private listener: ((user: SessionUser | null) => void) | null = null;
  user: SessionUser | null = null;
  refreshed = false;

  getCurrentUser() { return this.user; }
  subscribe(listener: (user: SessionUser | null) => void) {
    this.listener = listener;
    return () => { this.listener = null; };
  }
  async getToken(forceRefresh?: boolean) {
    this.refreshed = Boolean(forceRefresh);
    return this.user ? 'token' : null;
  }
  async signOut() {
    this.user = null;
    this.listener?.(null);
  }
  emit(user: SessionUser | null) {
    this.user = user;
    this.listener?.(user);
  }
}

describe('AuthStore', () => {
  it('tracks gateway sessions and forwards forced token refresh', async () => {
    const gateway = new FakeGateway();
    const store = new AuthStore(gateway);
    store.start();
    expect(store.getSnapshot().status).toBe('anonymous');

    gateway.emit({ id: 'user-1', email: 'reader@example.com' });
    expect(store.getSnapshot()).toEqual({
      status: 'authenticated',
      user: { id: 'user-1', email: 'reader@example.com' }
    });
    await expect(store.getToken(true)).resolves.toBe('token');
    expect(gateway.refreshed).toBe(true);
  });
});

