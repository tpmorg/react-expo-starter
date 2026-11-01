import type { AuthState, ErrorReporter, SessionUser } from '../contracts';
import type { KeyValuePort } from '../storage/ports';
import { LOCAL_OWNER, type OwnedLocalData } from './ownedLocalData';

export type ProviderCredential =
  | { providerId: 'apple.com'; idToken: string; rawNonce: string }
  | { providerId: 'google.com'; idToken: string };
export interface IdentityProvider<C = ProviderCredential> {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  getCredential(): Promise<C | null>;
  signOut?(): Promise<void>;
}
export type LinkResult<E> = { status: 'linked' } | { status: 'in_use'; existing: E };
export interface AccountAuth<C = ProviderCredential, E = unknown> {
  signInAnonymously(): Promise<void>;
  linkWithCredential(credential: C): Promise<LinkResult<E>>;
  signInWithExisting(existing: E): Promise<string>;
}
export interface MergeTicket { ticketId: string; expiresAt: string }
export interface AccountBackend<T> {
  readonly isConfigured: boolean;
  bootstrap(): Promise<T>;
  createMergeTicket(): Promise<MergeTicket>;
  completeMerge(ticketId: string): Promise<void>;
  /** Optional server-side proof for the rare crash between switching auth and saving destination uid. */
  confirmMergeDestination?(ticketId: string, fromUid: string, toUid: string): Promise<boolean>;
  deleteAccount(): Promise<void>;
}
export interface AccountSnapshot<T> {
  status: 'idle' | 'signing_in' | 'bootstrapping' | 'ready' | 'offline' | 'failed' | 'recovery_required';
  profile: T | null;
}
export class AccountError extends Error {
  constructor(readonly code: 'NOT_AVAILABLE' | 'NOT_READY' | 'ALREADY_SIGNED_IN' | 'ACCOUNT_CHANGED' | 'OFFLINE') {
    super(accountErrorMessage({ code })); this.name = 'AccountError';
  }
}
export function accountErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['OFFLINE', 'NETWORK', 'TIMEOUT'].includes(code)) return 'Connect to the internet and try again.';
  if (code === 'NOT_AVAILABLE') return 'This sign-in method is unavailable on this device.';
  if (code === 'RATE_LIMITED') return 'Please wait a moment and try again.';
  if (code === 'ALREADY_SIGNED_IN') return 'An account is already signed in.';
  if (code === 'ACCOUNT_CHANGED') return 'The active account changed. Please try again.';
  if (code === 'NOT_READY') return 'Your account is still getting ready. Please try again.';
  return 'The account action could not be completed. Please try again.';
}
interface PendingMerge extends MergeTicket { fromUid: string; toUid: string | null }
interface PendingDelete { ownerId: string; serverConfirmed: boolean }
export const PENDING_MERGE_KEY = 'account.pendingMerge';
export const PENDING_DELETE_KEY = 'account.pendingDelete';

export interface AccountServiceOptions<T, C, E> {
  auth: AccountAuth<C, E> | null;
  backend: AccountBackend<T>;
  session: { getSnapshot(): AuthState; signOut(): Promise<void> };
  store: KeyValuePort;
  reporter: ErrorReporter;
  localData: OwnedLocalData;
  providers?: readonly IdentityProvider<C>[];
}

/** App policy and backend routes are injected. Tokens and credentials are never persisted. */
export class AccountService<T, C = ProviderCredential, E = unknown> {
  private snapshot: AccountSnapshot<T> = { status: 'idle', profile: null };
  private listeners = new Set<(snapshot: AccountSnapshot<T>) => void>();
  private latest: { state: AuthState; online: boolean } | null = null;
  private syncing: Promise<void> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private owner: string | null = null;
  private revision = 0;
  private bootstrapped: string | null = null;
  constructor(private readonly deps: AccountServiceOptions<T, C, E>) {}
  getSnapshot() { return this.snapshot; }
  subscribe(listener: (snapshot: AccountSnapshot<T>) => void) {
    this.listeners.add(listener); listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }
  async availableProviders(): Promise<string[]> {
    if (!this.deps.auth) return [];
    const available = await Promise.all((this.deps.providers ?? []).map(async p => await p.isAvailable().catch(() => false) ? p.id : null));
    return available.filter((id): id is string => id !== null);
  }
  sync(state: AuthState, online: boolean): Promise<void> {
    this.track(state);
    this.latest = { state, online };
    if (!this.syncing) {
      this.syncing = this.serial(async () => {
        while (this.latest) {
          const input = this.latest; this.latest = null;
          await this.run(input.state, input.online);
        }
      }).finally(() => { this.syncing = null; });
    }
    return this.syncing;
  }
  signIn(providerId: string): Promise<'linked' | 'merged' | 'pending' | 'cancelled'> {
    return this.serial(async () => {
      this.track(this.deps.session.getSnapshot());
      const { auth, backend, store, localData } = this.deps;
      const provider = this.deps.providers?.find(p => p.id === providerId);
      if (!auth || !provider || !(await provider.isAvailable())) throw new AccountError('NOT_AVAILABLE');
      const user = this.user();
      if (!user) throw new AccountError('NOT_READY');
      if (!user.isAnonymous) throw new AccountError('ALREADY_SIGNED_IN');
      const revision = this.revision;
      const credential = await provider.getCredential();
      this.assertOwner(user.id, revision);
      if (!credential) return 'cancelled';
      if (await store.get(PENDING_MERGE_KEY)) throw new AccountError('NOT_READY');
      if (await store.get(PENDING_DELETE_KEY)) throw new AccountError('NOT_READY');
      this.assertOwner(user.id, revision);
      const link = await auth.linkWithCredential(credential);
      this.assertOwner(user.id, revision);
      if (link.status === 'linked') { this.bootstrapped = null; await this.bootstrap(user.id); return 'linked'; }
      // The guest must authorize the ticket and journal before any account switch.
      const ticket = backend.isConfigured ? await backend.createMergeTicket() : null;
      this.assertOwner(user.id, revision);
      const journal: PendingMerge = { ...(ticket ?? { ticketId: '', expiresAt: '9999-01-01' }), fromUid: user.id, toUid: null };
      await store.set(PENDING_MERGE_KEY, journal);
      const toUid = await auth.signInWithExisting(link.existing);
      // A later, unrelated account switch must never rekey data into that account.
      if (this.user()?.id !== toUid) throw new AccountError('ACCOUNT_CHANGED');
      this.track(this.deps.session.getSnapshot());
      journal.toUid = toUid;
      await store.set(PENDING_MERGE_KEY, journal);
      try {
        await localData.rekeyOwner(user.id, toUid);
        this.assertOwner(toUid);
        if (ticket) await backend.completeMerge(ticket.ticketId);
        this.assertOwner(toUid);
        await store.remove(PENDING_MERGE_KEY);
      } catch (error) {
        this.report('account.merge', error); this.publish({ status: 'recovery_required' });
        return 'pending';
      }
      this.bootstrapped = null; await this.bootstrap(toUid);
      return 'merged';
    });
  }
  signOut(): Promise<void> {
    return this.serial(async () => {
      const owner = this.user()?.id ?? null;
      for (const provider of this.deps.providers ?? []) await provider.signOut?.().catch(() => undefined);
      if ((this.user()?.id ?? null) !== owner) throw new AccountError('ACCOUNT_CHANGED');
      await this.deps.session.signOut();
      this.track(this.deps.session.getSnapshot());
    });
  }
  /** Explicit recovery uses backend proof; never bind an unresolved ticket to an arbitrary login. */
  recoverPendingMerge(): Promise<void> {
    return this.serial(async () => {
      this.track(this.deps.session.getSnapshot());
      const user = this.user();
      const merge = await this.deps.store.get<PendingMerge>(PENDING_MERGE_KEY);
      if (!user || user.isAnonymous || !merge || Date.parse(merge.expiresAt) <= Date.now()) throw new AccountError('NOT_READY');
      const revision = this.revision;
      if (merge.toUid === null) {
        if (!await this.deps.backend.confirmMergeDestination?.(merge.ticketId, merge.fromUid, user.id)) throw new AccountError('NOT_READY');
        this.assertOwner(user.id, revision);
        merge.toUid = user.id; await this.deps.store.set(PENDING_MERGE_KEY, merge);
      }
      this.assertOwner(user.id, revision);
      await this.run(this.deps.session.getSnapshot(), true);
    });
  }
  deleteAccount(): Promise<void> {
    return this.serial(async () => {
      const user = this.user();
      if (!user || !this.deps.backend.isConfigured) throw new AccountError('NOT_READY');
      const existing = await this.deps.store.get<PendingDelete>(PENDING_DELETE_KEY);
      if (existing && existing.ownerId !== user.id) throw new AccountError('NOT_READY');
      const revision = this.revision;
      await this.deps.store.set<PendingDelete>(PENDING_DELETE_KEY, { ownerId: user.id, serverConfirmed: false });
      this.assertOwner(user.id, revision);
      await this.deps.backend.deleteAccount();
      await this.deps.store.set<PendingDelete>(PENDING_DELETE_KEY, { ownerId: user.id, serverConfirmed: true });
      await this.finishDelete(user.id);
    });
  }
  private async run(state: AuthState, online: boolean) {
    if (state.status === 'loading' || !this.deps.auth) return;
    try {
      const deletion = await this.deps.store.get<PendingDelete>(PENDING_DELETE_KEY);
      if (deletion?.serverConfirmed) { await this.finishDelete(deletion.ownerId); return; }
      if (deletion) { this.publish({ status: 'recovery_required' }); return; }
      if (state.status === 'anonymous') {
        if (!online) { this.publish({ status: 'offline' }); return; }
        this.publish({ status: 'signing_in' });
        await this.deps.auth.signInAnonymously();
        return; // Firebase's callback queues the latest input, even before this promise resolves.
      }
      const uid = state.user.id;
      this.assertOwner(uid);
      await this.deps.localData.rekeyOwner(LOCAL_OWNER, uid);
      this.assertOwner(uid);
      const merge = await this.deps.store.get<PendingMerge>(PENDING_MERGE_KEY);
      if (merge) {
        if (merge.toUid !== uid || !online || Date.parse(merge.expiresAt) <= Date.now()) {
          this.publish({ status: 'recovery_required' }); return;
        }
        await this.deps.localData.rekeyOwner(merge.fromUid, uid);
        this.assertOwner(uid);
        if (merge.ticketId) await this.deps.backend.completeMerge(merge.ticketId);
        this.assertOwner(uid);
        await this.deps.store.remove(PENDING_MERGE_KEY);
      }
      if (!online) { this.publish({ status: 'offline' }); return; }
      if (this.bootstrapped !== uid) await this.bootstrap(uid);
    } catch (error) {
      if (error instanceof AccountError && error.code === 'ACCOUNT_CHANGED') return;
      this.report('account.sync', error); this.publish({ status: 'failed' });
    }
  }
  private async bootstrap(uid: string) {
    if (!this.deps.backend.isConfigured) { this.publish({ status: 'ready' }); return; }
    this.assertOwner(uid);
    const revision = this.revision;
    this.publish({ status: 'bootstrapping' });
    try {
      const profile = await this.deps.backend.bootstrap();
      this.assertOwner(uid, revision);
      this.bootstrapped = uid; this.publish({ status: 'ready', profile });
    } catch (error) {
      if (this.user()?.id !== uid || revision !== this.revision) return;
      this.report('account.bootstrap', error); this.publish({ status: 'failed' });
    }
  }
  private async finishDelete(uid: string) {
    await this.deps.localData.purgeOwner(uid);
    const merge = await this.deps.store.get<PendingMerge>(PENDING_MERGE_KEY);
    if (merge?.fromUid === uid || merge?.toUid === uid) await this.deps.store.remove(PENDING_MERGE_KEY);
    if (this.user()?.id === uid) {
      for (const provider of this.deps.providers ?? []) await provider.signOut?.().catch(() => undefined);
      if (this.user()?.id === uid) await this.deps.session.signOut();
    }
    await this.deps.store.remove(PENDING_DELETE_KEY);
    this.track(this.deps.session.getSnapshot());
  }
  private user(): SessionUser | null { return this.deps.session.getSnapshot().user; }
  private assertOwner(uid: string, revision = this.revision) {
    if (this.user()?.id !== uid || revision !== this.revision) throw new AccountError('ACCOUNT_CHANGED');
  }
  private track(state: AuthState) {
    if (state.status === 'loading') return;
    const uid = state.user?.id ?? null;
    if (uid !== this.owner) {
      this.owner = uid; ++this.revision; this.bootstrapped = null;
      this.publish({ status: 'idle', profile: null });
    }
  }
  private serial<R>(run: () => Promise<R>): Promise<R> {
    const result = this.tail.then(run, run); this.tail = result.catch(() => undefined); return result;
  }
  private report(operation: string, error: unknown) {
    this.deps.reporter.captureException(new Error(accountErrorMessage(error)), { operation });
  }
  private publish(patch: Partial<AccountSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener(this.snapshot));
  }
}
