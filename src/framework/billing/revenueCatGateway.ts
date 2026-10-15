import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import type {
  BillingGateway,
  BillingProduct,
  BillingState,
  PurchaseResult
} from '../contracts';

const emptyState = (entitlementId: string): BillingState => ({
  isConfigured: false,
  isVerified: false,
  hasEntitlement: false,
  entitlementId,
  creditBalance: 0,
  activeProductIds: [],
  purchasedProductIds: [],
  checkedAt: Date.now()
});

export class RevenueCatGateway implements BillingGateway {
  private configured = false;
  private packages = new Map<string, PurchasesPackage>();
  private get entitlementId() { return this.options.entitlementId; }
  private get creditCode() { return this.options.creditCode; }
  constructor(private readonly options: {
    iosKey?: string; androidKey?: string; entitlementId: string; creditCode: string;
    creditPackProductIds: readonly string[];
  }) {}
  async configure(userId: string): Promise<boolean> {
    if (this.configured) return true;
    const apiKey = Platform.select({
      ios: this.options.iosKey,
      android: this.options.androidKey
    });
    if (!apiKey) return false;

    Purchases.configure({ apiKey, appUserID: userId });
    this.configured = true;
    return true;
  }

  async identify(userId: string): Promise<void> {
    if (!this.configured) return;
    await Purchases.logIn(userId);
  }

  async getState(refresh = false): Promise<BillingState> {
    if (!this.configured) return emptyState(this.entitlementId);
    try {
      if (refresh) {
        await Purchases.invalidateCustomerInfoCache();
        await Purchases.invalidateVirtualCurrenciesCache();
      }
      const [customerInfo, currencies] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getVirtualCurrencies()
      ]);
      return this.mapState(customerInfo, Number(currencies.all?.[this.creditCode]?.balance ?? 0));
    } catch {
      return { ...emptyState(this.entitlementId), isConfigured: true };
    }
  }

  async getProducts(): Promise<BillingProduct[]> {
    if (!this.configured) return [];
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    this.packages = new Map(packages.map((item) => [item.identifier, item]));

    return packages.map((item) => ({
      id: item.product.identifier,
      packageId: item.identifier,
      title: item.product.title,
      description: item.product.description,
      priceLabel: item.product.priceString,
      kind: this.options.creditPackProductIds.includes(item.product.identifier) ? 'credit_pack' : 'subscription'
    }));
  }

  async purchase(product: BillingProduct): Promise<PurchaseResult> {
    if (!this.configured) {
      return { status: 'failed', state: emptyState(this.entitlementId), message: 'Purchases are unavailable.' };
    }
    try {
      let selected = this.packages.get(product.packageId);
      if (!selected) {
        await this.getProducts();
        selected = this.packages.get(product.packageId);
      }
      if (!selected) {
        return { status: 'failed', state: await this.getState(), message: 'Product is unavailable.' };
      }
      const { customerInfo } = await Purchases.purchasePackage(selected);
      return { status: 'purchased', state: await this.stateFromPurchase(customerInfo) };
    } catch (error) {
      const purchaseError = error as { userCancelled?: boolean; message?: string };
      return {
        status: purchaseError.userCancelled ? 'cancelled' : 'failed',
        state: await this.getState(),
        message: purchaseError.userCancelled ? undefined : purchaseError.message
      };
    }
  }

  async restore(): Promise<BillingState> {
    if (!this.configured) return emptyState(this.entitlementId);
    const info = await Purchases.restorePurchases();
    return this.stateFromPurchase(info);
  }

  async logOut(): Promise<void> {
    if (this.configured) await Purchases.logOut();
  }

  private async stateFromPurchase(info: CustomerInfo): Promise<BillingState> {
    await Purchases.invalidateVirtualCurrenciesCache();
    const currencies = await Purchases.getVirtualCurrencies();
    return this.mapState(info, Number(currencies.all?.[this.creditCode]?.balance ?? 0));
  }

  private mapState(info: CustomerInfo, creditBalance: number): BillingState {
    return {
      isConfigured: true,
      isVerified: true,
      hasEntitlement: Boolean(info.entitlements.active[this.entitlementId]),
      entitlementId: this.entitlementId,
      creditBalance: Math.max(0, creditBalance),
      activeProductIds: [...info.activeSubscriptions],
      purchasedProductIds: [...info.allPurchasedProductIdentifiers],
      checkedAt: Date.now()
    };
  }
}
