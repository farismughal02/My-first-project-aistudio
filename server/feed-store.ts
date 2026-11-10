import type { CyberDispatch, NewsSourceConfig } from '../src/types/news.ts';

export class FeedStore {
  private items = new Map<string, CyberDispatch[]>();
  private lastAttempt: number | undefined;
  private inFlight: Promise<{ dispatches: CyberDispatch[]; sources: NewsSourceConfig[] }> | undefined;
  constructor(private download: (url: string) => Promise<string>, private parse: (xml: string, source: NewsSourceConfig) => CyberDispatch[], private now = Date.now) {}
  private snapshot(sources: NewsSourceConfig[]) {
    const unique = new Map([...this.items.values()].flat().map(item => [item.id, item]));
    return { sources, dispatches: [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)) };
  }
  async refresh(sources: NewsSourceConfig[]) {
    if (this.inFlight) return this.inFlight;
    if (this.lastAttempt !== undefined && this.now() - this.lastAttempt < 45_000) return this.snapshot(sources);
    this.inFlight = (async () => {
      const feeds = sources.filter(source => source.enabled && !source.feedUrl.endsWith('.json'));
      for (let offset = 0; offset < feeds.length; offset += 3) {
        await Promise.all(feeds.slice(offset, offset + 3).map(async source => {
          try {
            const parsed = this.parse(await this.download(source.feedUrl), source);
            if (!parsed.length) throw new Error('No supported entries.');
            this.items.set(source.id, parsed);
            source.articleCount = parsed.length;
            source.lastSyncedAt = new Date(this.now()).toISOString();
            source.status = 'Synced';
            source.error = undefined;
          } catch {
            source.status = this.items.has(source.id) ? 'Stale' : 'Error';
            source.error = 'Feed could not be refreshed. Previous articles, if any, are retained.';
          }
        }));
      }
      this.lastAttempt = this.now();
      return this.snapshot(sources);
    })();
    try { return await this.inFlight; } finally { this.inFlight = undefined; }
  }
}
