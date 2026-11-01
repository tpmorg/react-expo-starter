import type { IdFactory } from '../ids';
/** Browser preview does not pretend that blob URLs are durable document storage. */
export class MediaStore {
  constructor(_ids: IdFactory, _rootDirectory?: string) {}
  async persist(_uri: string, _role: 'source' | 'result' | 'guidance', _extension = 'jpg'): Promise<string> {
    throw new Error('Durable media storage requires a platform adapter on web.');
  }
  async remove(_uri: string): Promise<void> { throw new Error('Durable media storage is unavailable on web.'); }
  owns(_uri: string): boolean { return false; }
}
