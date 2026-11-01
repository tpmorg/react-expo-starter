import { GoogleAuthProvider, OAuthProvider, linkWithCredential, signInAnonymously, signInWithCredential,
  type Auth, type AuthCredential } from 'firebase/auth';
import type { AccountAuth, LinkResult, ProviderCredential } from '../account/accountService';

export class FirebaseAccountAuth implements AccountAuth<ProviderCredential, AuthCredential> {
  constructor(private readonly auth: Auth) {}
  async signInAnonymously() { await signInAnonymously(this.auth); }
  async linkWithCredential(credential: ProviderCredential): Promise<LinkResult<AuthCredential>> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No active session.');
    const value = credential.providerId === 'apple.com'
      ? new OAuthProvider('apple.com').credential({ idToken: credential.idToken, rawNonce: credential.rawNonce })
      : GoogleAuthProvider.credential(credential.idToken);
    try {
      await linkWithCredential(user, value);
      await user.getIdToken(true);
      return { status: 'linked' };
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'auth/credential-already-in-use')) throw error;
      const recovered = credential.providerId === 'apple.com'
        ? OAuthProvider.credentialFromError(error as never) : GoogleAuthProvider.credentialFromError(error as never);
      return { status: 'in_use', existing: recovered ?? value };
    }
  }
  async signInWithExisting(credential: AuthCredential) { return (await signInWithCredential(this.auth, credential)).user.uid; }
}
