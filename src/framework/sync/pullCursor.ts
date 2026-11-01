import type { KeyValuePort } from '../storage/ports';
export class PullCursor {
  constructor(private readonly store: KeyValuePort, private readonly stream: string) {}
  get<T extends string | number>(ownerId: string) { return this.store.get<T>(this.key(ownerId)); }
  /** Persist only after all returned rows have been safely merged. */
  set(ownerId: string, cursor: string | number) { return this.store.set(this.key(ownerId), cursor); }
  clear(ownerId: string) { return this.store.remove(this.key(ownerId)); }
  private key(ownerId: string) { return `sync.cursor:${JSON.stringify([this.stream, ownerId])}`; }
}
