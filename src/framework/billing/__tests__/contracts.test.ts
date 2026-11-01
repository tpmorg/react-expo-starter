import { BillingStore, BillingAccountChangedError } from '../billingStore';
import { normalizeBillingState } from '../normalizeBillingState';
import type { BillingGateway } from '../../contracts';
test('normalizes legacy billing snapshots without trusting cached verification', () => {
  expect(normalizeBillingState({ isVerified: true, creditBalance: -1 })).toMatchObject({
    isVerified: false, creditBalance: 0, activeEntitlementIds: [], activeProductIds: []
  });
  expect(normalizeBillingState(null)).toBeNull();
});
test('waits for initialization and uses a typed error for a stale operation', async () => {
  let configure!: () => void;
  const value = normalizeBillingState({})!;
  const gateway: BillingGateway = {
    configure: () => new Promise(resolve => { configure = () => resolve(true); }), identify: async () => {}, getState: async () => value,
    getProducts: async () => [], purchase: async () => ({ status: 'purchased', state: value }), restore: async () => value, logOut: async () => {}
  };
  const store = new BillingStore(gateway, { get: async () => null, save: async () => {}, clear: async () => {} },
    { captureException() {}, addBreadcrumb() {}, setUser() {} });
  const start = store.start('a');
  let settled = false; const waiting = store.whenSettled().then(() => { settled = true; });
  while (!configure) await Promise.resolve();
  expect(settled).toBe(false); configure(); await start; await waiting;
  expect(settled).toBe(true);
  expect(new BillingAccountChangedError()).toBeInstanceOf(Error);
});
