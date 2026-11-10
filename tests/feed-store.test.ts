import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedStore } from '../server/feed-store.ts';
import type { CyberDispatch, NewsSourceConfig } from '../src/types/news.ts';

const source = (): NewsSourceConfig => ({ id: 'test', name: 'Test', feedUrl: 'https://example.com/rss', siteUrl: 'https://example.com', enabled: true, articleCount: 0, lastSyncedAt: '', status: 'Pending', publisherType: 'Community Feed' });
const article = { id: 'one', title: 'A story', publishedAt: '2026-11-02T12:00:00Z' } as CyberDispatch;
test('a failed refresh keeps previous articles and last successful timestamp', async () => {
  let now = 1000;
  let fail = false;
  const store = new FeedStore(async () => { if (fail) throw new Error('Offline'); return 'xml'; }, () => [article], () => now);
  const sources = [source()];
  await store.refresh(sources);
  const lastSuccess = sources[0].lastSyncedAt;
  fail = true; now += 46_000;
  assert.deepEqual((await store.refresh(sources)).dispatches, [article]);
  assert.equal(sources[0].status, 'Stale');
  assert.equal(sources[0].lastSyncedAt, lastSuccess);
});
test('overlapping requests share one fetch and failures are cached too', async () => {
  let calls = 0;
  const store = new FeedStore(async () => { calls++; throw new Error('Offline'); }, () => []);
  const sources = [source()];
  await Promise.all([store.refresh(sources), store.refresh(sources)]);
  await store.refresh(sources);
  assert.equal(calls, 1);
  assert.equal(sources[0].status, 'Error');
  assert.equal(sources[0].lastSyncedAt, '');
});
