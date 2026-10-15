import Constants from 'expo-constants';

export interface RuntimeConfig {
  apiUrl: string;
  sentryDsn: string | null;
  revenueCatEntitlementId: string;
  revenueCatCreditCode: string;
  hasRevenueCatIosKey: boolean;
  hasRevenueCatAndroidKey: boolean;
}

export interface ConfigIssue {
  key: string;
  severity: 'warning' | 'error';
  message: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const extra = Constants.expoConfig?.extra ?? {};
  return {
    apiUrl: stringValue(extra.apiUrl),
    sentryDsn: nullableString(extra.sentryDsn),
    revenueCatEntitlementId: stringValue(extra.revenueCatEntitlementId) || '',
    revenueCatCreditCode: stringValue(extra.revenueCatCreditCode) || '',
    hasRevenueCatIosKey: Boolean(extra.revenueCatIosKey),
    hasRevenueCatAndroidKey: Boolean(extra.revenueCatAndroidKey)
  };
}

export function validateRuntimeConfig(config: RuntimeConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (!config.apiUrl) {
    issues.push({ key: 'apiUrl', severity: 'warning', message: 'Generation API is not configured.' });
  } else {
    try {
      const url = new URL(config.apiUrl);
      if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
        issues.push({ key: 'apiUrl', severity: 'error', message: 'Generation API must use HTTPS outside local development.' });
      }
    } catch {
      issues.push({ key: 'apiUrl', severity: 'error', message: 'Generation API URL is invalid.' });
    }
  }
  if (config.sentryDsn && !/^https:\/\/.+@.+\/.+/.test(config.sentryDsn)) {
    issues.push({ key: 'sentryDsn', severity: 'warning', message: 'Sentry DSN is invalid; reporting will remain disabled.' });
  }
  return issues;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2';
}
