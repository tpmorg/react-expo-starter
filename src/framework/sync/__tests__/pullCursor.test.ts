import { PullCursor } from '../pullCursor';
import { memoryStore } from '../../testing/memoryStore';
test('cursor scope includes stream and owner without delimiter collisions', async () => {
  const store = memoryStore();
  const one = new PullCursor(store, 'a:b'), two = new PullCursor(store, 'a');
  await one.set('c', 10); await two.set('b:c', 20);
  await expect(one.get('c')).resolves.toBe(10); await expect(two.get('b:c')).resolves.toBe(20);
  await expect(one.get('other')).resolves.toBeNull();
  await one.clear('c'); await expect(one.get('c')).resolves.toBeNull();
});
