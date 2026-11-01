import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyValueStore } from '../keyValueStore';
test('a corrupt preference returns null without reporting its content or key', async () => {
  await AsyncStorage.setItem('@test:private-key', '{private-data');
  const captureException = jest.fn();
  const store = new KeyValueStore('@test', { captureException, addBreadcrumb() {}, setUser() {} });
  await expect(store.get('private-key')).resolves.toBeNull();
  expect(captureException).toHaveBeenCalledTimes(1);
  expect(String(captureException.mock.calls[0]?.[0])).not.toContain('private');
  await expect(store.get('missing')).resolves.toBeNull();
});
