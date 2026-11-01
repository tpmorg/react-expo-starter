export function storeMode(publicKey: string | null | undefined): 'test' | 'apple' | 'google' | 'unknown' {
  if (publicKey?.startsWith('test_')) return 'test';
  if (publicKey?.startsWith('appl_')) return 'apple';
  if (publicKey?.startsWith('goog_')) return 'google';
  return 'unknown';
}
/** Compare IDs without copying tokens or server/customer payloads into diagnostics. */
export function compareEntitlements(device: readonly string[], server: readonly string[]) {
  return {
    onlyOnDevice: [...new Set(device)].filter(id => !server.includes(id)).sort(),
    onlyOnServer: [...new Set(server)].filter(id => !device.includes(id)).sort()
  };
}
