export const LOCAL_OWNER = 'local';
/** Rekey must be idempotent and reconcile collisions according to the feature's data rules. */
export interface OwnedLocalData {
  rekeyOwner(from: string, to: string): Promise<void>;
  purgeOwner(ownerId: string): Promise<void>;
}
export class OwnedLocalDataRegistry implements OwnedLocalData {
  private readonly stores = new Set<OwnedLocalData>();
  register(store: OwnedLocalData): () => void {
    this.stores.add(store);
    return () => { this.stores.delete(store); };
  }
  async rekeyOwner(from: string, to: string): Promise<void> {
    if (from === to) return;
    for (const store of this.stores) await store.rekeyOwner(from, to);
  }
  async purgeOwner(ownerId: string): Promise<void> {
    // Attempt every store even if one fails; callers retain their recovery journal on failure.
    const results = await Promise.allSettled([...this.stores].map(store => store.purgeOwner(ownerId)));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
}
