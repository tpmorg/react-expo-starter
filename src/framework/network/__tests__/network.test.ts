import { isOnline } from '../networkMonitor';
test('unknown initial probe is potentially online, explicit offline is not', () => {
  expect(isOnline({ isConnected: null, isInternetReachable: null, connectionType: 'unknown' })).toBe(true);
  expect(isOnline({ isConnected: true, isInternetReachable: false, connectionType: 'wifi' })).toBe(false);
  expect(isOnline({ isConnected: false, isInternetReachable: null, connectionType: 'none' })).toBe(false);
});
