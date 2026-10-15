import type { BillingGateway, BillingState } from '../../contracts';
import { BillingStore, type BillingCachePort } from '../billingStore';

const state: BillingState = {
  isConfigured: true,
  isVerified: true,
  hasEntitlement: true,
  entitlementId: 'plus',
  creditBalance: 3,
  activeProductIds: ['monthly'],
  purchasedProductIds: ['monthly'],
  checkedAt: 10
};

describe('BillingStore', () => {
  it('publishes cached state and replaces it with verified live state', async () => {
    const seen: string[] = [];
    const cache: BillingCachePort = {
      get: async () => ({ ...state, isVerified: false, checkedAt: 1 }),
      save: async () => undefined,
      clear: async () => undefined
    };
    const gateway: BillingGateway = {
      configure: async () => true,
      identify: async () => undefined,
      getState: async () => state,
      getProducts: async () => [],
      purchase: async () => ({ status: 'purchased', state }),
      restore: async () => state,
      logOut: async () => undefined
    };
    const store = new BillingStore(gateway, cache, {
      captureException: () => undefined,
      addBreadcrumb: () => undefined,
      setUser: () => undefined
    });
    store.subscribe((next) => seen.push(next.status));

    await store.start('user-1');

    expect(store.getSnapshot()).toEqual({ status: 'ready', value: state, error: null });
    expect(seen).toEqual(['idle', 'loading', 'loading', 'ready']);
  });
});
