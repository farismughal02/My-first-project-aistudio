import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRssXml } from '../server/rss.ts';
import type { NewsSourceConfig } from '../src/types/news.ts';
const source = { id: 'test', name: 'Test', siteUrl: 'https://example.com' } as NewsSourceConfig;
test('RSS parsing gives distinct IDs and never invents CVSS or exploitation claims', () => {
  const xml = '<rss><channel>' + ['A', 'B'].map(x => `<item><title>Critical flaw in product ${x}</title><link>https://example.com/${x}</link><description>Critical zero-day CVE-2026-12345.</description></item>`).join('') + '</channel></rss>';
  const items = parseRssXml(xml, source);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[0].severity, 'Unknown');
  assert.equal(items[0].cvssScore, undefined);
  assert.equal(items[0].activelyExploited, undefined);
  assert.equal(items[0].dataOrigin, 'live');
});
test('unsafe article links fall back to the publisher and feed text is bounded', () => {
  const [item] = parseRssXml(`<item><title>A sufficiently long headline</title><link>javascript:alert(1)</link><description>${'x'.repeat(15000)}</description></item>`, source);
  assert.equal(item.sourceUrl, 'https://example.com');
  assert.ok(item.leadBody.join('').length <= 12000);
});
