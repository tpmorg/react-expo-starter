import { Platform, TurboModuleRegistry } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import type * as Apple from 'expo-apple-authentication';
import type * as Google from '@react-native-google-signin/google-signin';
import type { IdentityProvider, ProviderCredential } from '../account/accountService';

const hasCode = (error: unknown, ...codes: string[]) => Boolean(error && typeof error === 'object' && 'code' in error && codes.includes(String(error.code)));
export class AppleIdentityProvider implements IdentityProvider {
  readonly id = 'apple.com';
  private module(): typeof Apple | null {
    if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoAppleAuthentication')) return null;
    return require('expo-apple-authentication') as typeof Apple;
  }
  async isAvailable() { return (await this.module()?.isAvailableAsync()) ?? false; }
  async getCredential(): Promise<ProviderCredential | null> {
    const apple = this.module();
    if (!apple || !(await apple.isAvailableAsync())) throw new Error('Sign-in provider unavailable.');
    const rawNonce = Array.from(Crypto.getRandomBytes(32), b => b.toString(16).padStart(2, '0')).join('');
    const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    try {
      const result = await apple.signInAsync({ nonce, requestedScopes: [apple.AppleAuthenticationScope.EMAIL, apple.AppleAuthenticationScope.FULL_NAME] });
      if (!result.identityToken) throw new Error('Sign-in provider returned no credential.');
      return { providerId: 'apple.com', idToken: result.identityToken, rawNonce };
    } catch (error) { if (hasCode(error, 'ERR_REQUEST_CANCELED')) return null; throw error; }
  }
}
export class GoogleIdentityProvider implements IdentityProvider {
  readonly id = 'google.com';
  private configured = false;
  constructor(private readonly webClientId: string | null, private readonly iosClientId: string | null = null) {}
  private module(): typeof Google | null {
    if (Platform.OS === 'web' || isRunningInExpoGo() || !TurboModuleRegistry.get('RNGoogleSignin')) return null;
    return require('@react-native-google-signin/google-signin') as typeof Google;
  }
  async isAvailable() { return Boolean(this.webClientId && (Platform.OS !== 'ios' || this.iosClientId) && this.module()); }
  private configure(module: typeof Google) {
    if (!this.configured) {
      module.GoogleSignin.configure({ webClientId: this.webClientId ?? undefined, iosClientId: this.iosClientId ?? undefined });
      this.configured = true;
    }
  }
  async getCredential(): Promise<ProviderCredential | null> {
    const module = this.module();
    if (!module || !(await this.isAvailable())) throw new Error('Sign-in provider unavailable.');
    this.configure(module);
    try {
      if (Platform.OS === 'android') await module.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await module.GoogleSignin.signIn();
      if (!module.isSuccessResponse(response)) return null;
      if (!response.data.idToken) throw new Error('Sign-in provider returned no credential.');
      return { providerId: 'google.com', idToken: response.data.idToken };
    } catch (error) { if (hasCode(error, module.statusCodes.SIGN_IN_CANCELLED, module.statusCodes.IN_PROGRESS)) return null; throw error; }
  }
  async signOut() {
    const module = this.module();
    if (module && await this.isAvailable()) { this.configure(module); await module.GoogleSignin.signOut(); }
  }
}
