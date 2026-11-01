import { Platform } from 'react-native';
import { createNotificationGateway, ExpoNotificationGateway } from '../expoNotificationGateway';
import type * as Notifications from 'expo-notifications';
jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

test('old development clients without the native module return unavailable before require', () => {
  expect(createNotificationGateway({ source: 'app', channelId: 'reminders', channelName: 'Reminders', isAllowedUrl: () => true })).toBeNull();
});
test('creates Android channel before permission; replaces and opens only its own notifications', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const order: string[] = [];
  const cancel = jest.fn(async (_id: string) => {});
  const schedule = jest.fn(async () => 'id');
  const notification = { request: { content: { data: { source: 'app', url: 'app://home' } } } };
  const module = {
    setNotificationHandler() {}, getPermissionsAsync: async () => ({ granted: true }),
    setNotificationChannelAsync: async () => { order.push('channel'); },
    requestPermissionsAsync: async () => { order.push('permission'); return { granted: true }; },
    getAllScheduledNotificationsAsync: async () => [
      { identifier: 'mine', content: { data: { source: 'app' } } },
      { identifier: 'other', content: { data: { source: 'other' } } }
    ], cancelScheduledNotificationAsync: cancel, scheduleNotificationAsync: schedule,
    AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    getLastNotificationResponse: () => ({ notification })
  } as unknown as typeof Notifications;
  try {
    const gateway = new ExpoNotificationGateway(module, { source: 'app', channelId: 'reminders', channelName: 'Reminders', isAllowedUrl: url => url.startsWith('app://') });
    await gateway.requestPermission(); expect(order).toEqual(['channel', 'permission']);
    await gateway.replaceScheduled([{ id: '1', fireAt: '2099-01-01', title: 'Title', body: 'Body', url: 'app://home' }]);
    expect(cancel.mock.calls).toEqual([['mine']]); expect(schedule).toHaveBeenCalledTimes(1);
    expect(gateway.launchUrl()).toBe('app://home');
    await expect(gateway.replaceScheduled([{ id: '2', fireAt: 'invalid', title: '', body: '', url: 'https://bad.test' }])).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
    notification.request.content.data.source = 'other'; expect(gateway.launchUrl()).toBeNull();
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: previous }); }
});
