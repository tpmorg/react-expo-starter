import type { BillingState } from '../contracts';

/** Old snapshots remain display-only, regardless of their saved verification flag. */
export function normalizeBillingState(input: unknown): BillingState | null {
  if (!input || typeof input !== 'object') return null;
  const v = input as Partial<BillingState>;
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  return {
    isConfigured: v.isConfigured === true, isVerified: false,
    hasEntitlement: v.hasEntitlement === true,
    entitlementId: typeof v.entitlementId === 'string' ? v.entitlementId : '',
    creditBalance: typeof v.creditBalance === 'number' && Number.isFinite(v.creditBalance) ? Math.max(0, v.creditBalance) : 0,
    activeProductIds: strings(v.activeProductIds), purchasedProductIds: strings(v.purchasedProductIds),
    activeEntitlementIds: strings(v.activeEntitlementIds),
    checkedAt: typeof v.checkedAt === 'number' && Number.isFinite(v.checkedAt) ? v.checkedAt : 0
  };
}
