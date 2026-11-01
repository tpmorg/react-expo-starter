import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type * as Notifications from 'expo-notifications';
import type { LocalNotification, NotificationGateway, NotificationOptions, NotificationPermission } from './contracts';

export function createNotificationGateway(options: NotificationOptions): NotificationGateway | null {
  if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoPushTokenManager') || !requireOptionalNativeModule('ExpoNotificationScheduler')) return null;
  return new ExpoNotificationGateway(require('expo-notifications') as typeof Notifications, options);
}
export class ExpoNotificationGateway implements NotificationGateway {
  private channel: Promise<void> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly notifications: typeof Notifications, private readonly options: NotificationOptions) {
    notifications.setNotificationHandler({ handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false
    }) });
  }
  async getPermission(): Promise<NotificationPermission> { return this.permission(await this.notifications.getPermissionsAsync()); }
  async requestPermission(): Promise<NotificationPermission> {
    await this.ensureChannel();
    return this.permission(await this.notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  }
  replaceScheduled(items: readonly LocalNotification[]): Promise<void> {
    // Validate the whole replacement before cancelling anything.
    if (items.some(item => !Number.isFinite(Date.parse(item.fireAt)) || !this.options.isAllowedUrl(item.url)) || new Set(items.map(item => item.id)).size !== items.length) {
      return Promise.reject(new Error('Invalid local notification schedule.'));
    }
    return this.serial(async () => {
      await this.cancelOwned(); await this.ensureChannel();
      for (const item of items) {
        const date = new Date(item.fireAt);
        if (date.getTime() <= Date.now()) continue;
        await this.notifications.scheduleNotificationAsync({
          identifier: `${this.options.source}:${item.id}`,
          content: { title: item.title, body: item.body, data: { source: this.options.source, url: item.url } },
          trigger: { type: this.notifications.SchedulableTriggerInputTypes.DATE, date, channelId: this.options.channelId }
        });
      }
    });
  }
  cancelAll(): Promise<void> { return this.serial(() => this.cancelOwned()); }
  private async cancelOwned() {
    const entries = await this.notifications.getAllScheduledNotificationsAsync();
    for (const entry of entries) if (entry.content.data?.source === this.options.source) await this.notifications.cancelScheduledNotificationAsync(entry.identifier);
  }
  launchUrl(): string | null {
    try { return this.url(this.notifications.getLastNotificationResponse()?.notification); }
    catch { return null; }
  }
  onOpen(listener: (url: string) => void) {
    const subscription = this.notifications.addNotificationResponseReceivedListener(response => {
      const url = this.url(response.notification); if (url) listener(url);
    });
    return () => subscription.remove();
  }
  private url(notification: Notifications.Notification | undefined): string | null {
    const data = notification?.request.content.data;
    return data?.source === this.options.source && typeof data.url === 'string' && this.options.isAllowedUrl(data.url) ? data.url : null;
  }
  private permission(value: Notifications.NotificationPermissionsStatus): NotificationPermission {
    return value.granted ? 'granted' : value.canAskAgain ? 'undetermined' : 'denied';
  }
  private ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    if (!this.channel) this.channel = this.notifications.setNotificationChannelAsync(this.options.channelId, {
      name: this.options.channelName, importance: this.notifications.AndroidImportance.DEFAULT
    }).then(() => undefined).catch(error => { this.channel = null; throw error; });
    return this.channel;
  }
  private serial(task: () => Promise<void>) {
    const result = this.tail.then(task, task); this.tail = result.catch(() => undefined); return result;
  }
}
