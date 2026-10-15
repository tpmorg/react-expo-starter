import { validateRuntimeConfig, type RuntimeConfig } from '../runtimeConfig';

const base: RuntimeConfig = {
  apiUrl: 'https://api.example.com',
  sentryDsn: null,
  revenueCatEntitlementId: '',
  revenueCatCreditCode: '',
  hasRevenueCatIosKey: false,
  hasRevenueCatAndroidKey: false
};

describe('validateRuntimeConfig', () => {
  it('accepts an HTTPS API', () => {
    expect(validateRuntimeConfig(base)).toEqual([]);
  });

  it('rejects insecure remote APIs but permits local development', () => {
    expect(validateRuntimeConfig({ ...base, apiUrl: 'http://api.example.com' })[0]?.severity).toBe('error');
    expect(validateRuntimeConfig({ ...base, apiUrl: 'http://localhost:3000' })).toEqual([]);
  });
});
