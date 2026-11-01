export type NotificationPermission = 'granted' | 'denied' | 'undetermined';
export interface LocalNotification { id: string; fireAt: string; title: string; body: string; url: string }
export interface NotificationGateway {
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  replaceScheduled(items: readonly LocalNotification[]): Promise<void>;
  cancelAll(): Promise<void>;
  launchUrl(): string | null;
  onOpen(listener: (url: string) => void): () => void;
}
export interface NotificationOptions {
  channelId: string; channelName: string; source: string;
  /** App-supplied allowlist for deep links; never trust arbitrary notification URLs. */
  isAllowedUrl(url: string): boolean;
}
