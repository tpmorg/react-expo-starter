import type { IdentityProvider, ProviderCredential } from '../account/accountService';
class Unavailable implements IdentityProvider {
  readonly id: string;
  constructor(id: string) { this.id = id; }
  async isAvailable() { return false; }
  async getCredential(): Promise<ProviderCredential | null> { return null; }
  async signOut() {}
}
export class AppleIdentityProvider extends Unavailable { constructor() { super('apple.com'); } }
export class GoogleIdentityProvider extends Unavailable {
  constructor(_webClientId: string | null, _iosClientId: string | null = null) { super('google.com'); }
}
