import type { BillingState } from '../contracts';

export interface LocalUsageSnapshot {
  freeUsed: number;
  freeLimit: number;
}

export interface GenerationAccess {
  allowedByClientHint: boolean;
  source: 'subscription' | 'credits' | 'free' | 'none' | 'unknown';
  remainingHint: number;
}

export function getGenerationAccess(
  billing: BillingState,
  local: LocalUsageSnapshot
): GenerationAccess {
  if (!billing.isVerified) {
    return { allowedByClientHint: true, source: 'unknown', remainingHint: 0 };
  }
  if (billing.creditBalance > 0) {
    return { allowedByClientHint: true, source: 'credits', remainingHint: billing.creditBalance };
  }
  if (billing.hasEntitlement) {
    return { allowedByClientHint: true, source: 'subscription', remainingHint: 0 };
  }
  const remaining = Math.max(0, local.freeLimit - local.freeUsed);
  return {
    allowedByClientHint: remaining > 0,
    source: remaining > 0 ? 'free' : 'none',
    remainingHint: remaining
  };
}

// This function only controls the UI. The backend remains authoritative and
// must atomically admit/debit every generation request.

