import Purchases from 'react-native-purchases';
import { RevenueCatGateway } from '../revenueCatGateway';
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {
  configure: jest.fn(),
  getOfferings: jest.fn(async () => ({ current: { availablePackages: [{ identifier: 'package', product: { identifier: 'credits', title: '', description: '', priceString: '$1', price: 1, currencyCode: 'USD', pricePerMonthString: null } }] } })),
  purchasePackage: jest.fn(async () => ({ customerInfo: { entitlements: { active: {} }, activeSubscriptions: [], allPurchasedProductIdentifiers: ['credits'] } })),
  invalidateVirtualCurrenciesCache: jest.fn(async () => {}),
  getVirtualCurrencies: jest.fn(async () => { throw new Error('offline'); })
} }));
test('a confirmed store payment remains purchased when credit reconciliation fails', async () => {
  const gateway = new RevenueCatGateway({ iosKey: 'test_public', androidKey: 'test_public', entitlementId: 'pro', creditCode: 'CRD', creditPackProductIds: ['credits'] });
  await gateway.configure('uid');
  const products = await gateway.getProducts();
  expect(products[0]).toMatchObject({ kind: 'credit_pack', price: 1, currencyCode: 'USD' });
  await expect(gateway.purchase(products[0]!)).resolves.toMatchObject({ status: 'purchased', state: { isVerified: false } });
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
});
