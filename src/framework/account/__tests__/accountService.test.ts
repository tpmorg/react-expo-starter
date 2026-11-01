import { AccountService, PENDING_MERGE_KEY, PENDING_DELETE_KEY, type AccountServiceOptions } from '../accountService';
import { OwnedLocalDataRegistry } from '../ownedLocalData';
import { memoryStore } from '../../testing/memoryStore';
import type { AuthState } from '../../contracts';

function fixture() {
  let state: AuthState = { status: 'authenticated', user: { id: 'guest', isAnonymous: true } };
  const store = memoryStore();
  const order: string[] = [];
  const localData = { rekeyOwner: jest.fn(async () => {}), purgeOwner: jest.fn(async () => {}) };
  const deps: AccountServiceOptions<{ value: number }, string, string> = {
    store, localData, reporter: { captureException: jest.fn(), addBreadcrumb() {}, setUser() {} },
    session: { getSnapshot: () => state, signOut: async () => { state = { status: 'anonymous', user: null }; } },
    auth: { signInAnonymously: jest.fn(async () => {}), linkWithCredential: jest.fn(async () => ({ status: 'linked' as const })), signInWithExisting: jest.fn(async () => {
      order.push('switch');
      expect(await store.get(PENDING_MERGE_KEY)).toMatchObject({ fromUid: 'guest', toUid: null });
      state = { status: 'authenticated', user: { id: 'existing', isAnonymous: false } };
      return 'existing';
    }) },
    backend: { isConfigured: true, bootstrap: jest.fn(async () => ({ value: 1 })),
      createMergeTicket: jest.fn(async () => { order.push('ticket'); return { ticketId: 'ticket', expiresAt: '2099-01-01' }; }),
      completeMerge: jest.fn(async () => { order.push('merge'); }), deleteAccount: jest.fn(async () => {}) },
    providers: [{ id: 'provider', isAvailable: async () => true, getCredential: async () => 'credential', signOut: jest.fn(async () => {}) }]
  };
  const service = new AccountService(deps);
  return { service, deps, store, localData, order, setState: (next: AuthState) => { state = next; }, sync: () => service.sync(state, true) };
}
test('links without switching uid and bootstraps again', async () => {
  const f = fixture(); await f.sync();
  await expect(f.service.signIn('provider')).resolves.toBe('linked');
  expect(f.deps.auth?.signInWithExisting).not.toHaveBeenCalled();
});
test('persists ticket before switching; transient merge failure resumes under destination owner', async () => {
  const f = fixture(); await f.sync();
  f.deps.auth!.linkWithCredential = async () => ({ status: 'in_use', existing: 'credential' });
  const merge = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  f.deps.backend.completeMerge = merge;
  await expect(f.service.signIn('provider')).resolves.toBe('pending');
  expect(f.order).toEqual(['ticket', 'switch']);
  expect(await f.store.get(PENDING_MERGE_KEY)).toMatchObject({ toUid: 'existing' });
  await f.sync();
  expect(merge).toHaveBeenCalledTimes(2);
  expect(await f.store.get(PENDING_MERGE_KEY)).toBeNull();
});
test('ignores bootstrap result after an account switch away and back', async () => {
  const f = fixture(); let resolve!: (v: { value: number }) => void;
  f.deps.backend.bootstrap = () => new Promise(r => { resolve = r; });
  const run = f.sync();
  // Allow storage adoption to finish and bootstrap to begin.
  while (!resolve) await Promise.resolve();
  f.setState({ status: 'authenticated', user: { id: 'other' } }); void f.sync();
  f.setState({ status: 'authenticated', user: { id: 'guest', isAnonymous: true } }); void f.sync();
  f.deps.backend.bootstrap = async () => ({ value: 2 });
  resolve({ value: 999 }); await run;
  expect(f.service.getSnapshot().profile).toEqual({ value: 2 });
});
test('Firebase emission during guest sign-in is drained instead of lost', async () => {
  const f = fixture(); f.setState({ status: 'anonymous', user: null });
  f.deps.auth!.signInAnonymously = async () => {
    f.setState({ status: 'authenticated', user: { id: 'created', isAnonymous: true } }); void f.sync();
  };
  await f.sync();
  expect(f.service.getSnapshot().status).toBe('ready');
});
test('a merge with no saved destination requires explicit backend proof before recovery', async () => {
  const f = fixture();
  await f.store.set(PENDING_MERGE_KEY, { ticketId: 'ticket', fromUid: 'guest', toUid: null, expiresAt: '2099-01-01' });
  f.setState({ status: 'authenticated', user: { id: 'existing', isAnonymous: false } });
  await expect(f.service.recoverPendingMerge()).rejects.toMatchObject({ code: 'NOT_READY' });
  expect(f.localData.rekeyOwner).not.toHaveBeenCalled();
  f.deps.backend.confirmMergeDestination = async () => true;
  await f.service.recoverPendingMerge();
  expect(f.localData.rekeyOwner).toHaveBeenCalledWith('guest', 'existing');
  expect(await f.store.get(PENDING_MERGE_KEY)).toBeNull();
});
test('deletion attempts every registered store and retains cleanup journal on local failure', async () => {
  const f = fixture(); await f.sync();
  const registry = new OwnedLocalDataRegistry();
  const a = { rekeyOwner: async () => {}, purgeOwner: jest.fn<Promise<void>, [string]>(async () => { throw new Error('disk'); }) };
  const b = { rekeyOwner: async () => {}, purgeOwner: jest.fn(async () => {}) };
  registry.register(a); registry.register(b); f.deps.localData = registry;
  await expect(f.service.deleteAccount()).rejects.toThrow('disk');
  expect(a.purgeOwner).toHaveBeenCalledWith('guest'); expect(b.purgeOwner).toHaveBeenCalledWith('guest');
  expect(await f.store.get(PENDING_DELETE_KEY)).toEqual({ ownerId: 'guest', serverConfirmed: true });
  a.purgeOwner.mockImplementation(async () => {});
  await f.sync(); expect(await f.store.get(PENDING_DELETE_KEY)).toBeNull();
  expect(f.deps.session.getSnapshot().status).toBe('anonymous');
});
