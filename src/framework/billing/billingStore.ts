import type { BillingGateway, BillingProduct, BillingState, ErrorReporter, PurchaseResult } from '../contracts';

export interface BillingCachePort {
  save(ownerId: string, state: BillingState): Promise<void>;
  get(ownerId: string): Promise<BillingState | null>;
  clear(ownerId: string): Promise<void>;
}
export type BillingStoreState =
  | {status: 'idle' | 'loading'; value: BillingState | null; error: null}
  | {status: 'ready'; value: BillingState; error: null}
  | {status: 'error'; value: BillingState | null; error: string};

export class BillingStore {
  private ownerId: string | null = null;
  private epoch = 0;
  // Serialize SDK work, including logIn/logOut, so an old operation cannot run under a new identity.
  private tail: Promise<unknown> = Promise.resolve();
  private state: BillingStoreState = {status:'idle',value:null,error:null};
  private listeners = new Set<(state: BillingStoreState) => void>();
  constructor(private gateway: BillingGateway, private cache: BillingCachePort, private reporter: ErrorReporter) {}
  getSnapshot() { return this.state; }
  subscribe(listener: (state: BillingStoreState) => void) {
    this.listeners.add(listener); listener(this.state);
    return () => {this.listeners.delete(listener);};
  }
  async start(ownerId: string): Promise<void> {
    if (this.ownerId === ownerId && ['ready','loading'].includes(this.state.status)) return;
    this.ownerId = ownerId;
    const epoch = ++this.epoch;
    this.publish({status:'loading',value:null,error:null});
    return this.serial(async () => {
      if(epoch !== this.epoch) return;
      try {
        const cached = await this.cache.get(ownerId);
        if(epoch !== this.epoch) return;
        this.publish({status:'loading',value:cached ? {...cached,isVerified:false} : null,error:null});
        const configured = await this.gateway.configure(ownerId);
        if(configured) await this.gateway.identify(ownerId);
        const live = await this.gateway.getState(false);
        if(epoch !== this.epoch) return;
        await this.cache.save(ownerId, live);
        if(epoch === this.epoch) this.publish({status:'ready',value:live,error:null});
      } catch(error) {
        this.reporter.captureException(error, {operation:'billing.start'});
        if(epoch === this.epoch) this.publish({status:'error',value:this.state.value,error:'Billing could not be loaded.'});
      }
    });
  }
  async stop(): Promise<void> {
    this.ownerId = null; ++this.epoch;
    this.publish({status:'idle',value:null,error:null});
    await this.serial(async () => {
      try {await this.gateway.logOut();}
      catch(error) {this.reporter.captureException(error,{operation:'billing.stop'});}
    });
  }
  refresh(force = true) {return this.operation(() => this.gateway.getState(force), value => value);}
  restore() {return this.operation(() => this.gateway.restore(), value => value);}
  purchase(product: BillingProduct): Promise<PurchaseResult> {
    return this.operation(() => this.gateway.purchase(product), result => result.state);
  }
  getProducts(): Promise<BillingProduct[]> {
    return this.operation(() => this.gateway.getProducts());
  }
  private operation<T>(run: () => Promise<T>, stateOf?: (value:T) => BillingState): Promise<T> {
    const owner = this.ownerId; const epoch = this.epoch;
    if(!owner) return Promise.reject(new Error('Billing has no active account.'));
    return this.serial(async () => {
      if(epoch !== this.epoch) throw new Error('Billing account changed.');
      const result = await run();
      if(epoch !== this.epoch) throw new Error('Billing account changed.');
      if(stateOf) {
        const state = stateOf(result);
        await this.cache.save(owner, state);
        if(epoch !== this.epoch) throw new Error('Billing account changed.');
        this.publish({status:'ready',value:state,error:null});
      }
      return result;
    });
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private publish(state: BillingStoreState) {
    this.state = state; this.listeners.forEach(listener => listener(state));
  }
}
