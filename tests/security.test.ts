import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, isPublicAddress, RateLimiter, validateFeedUrl } from '../server/security.ts';
import { articleId, GuideCache, guideKey, validateAiRequest, validateGuide } from '../server/domain.ts';

test('feed URLs require approved HTTPS hosts without credentials or custom ports', () => {
  const hosts = new Set(['feeds.example.com']);
  assert.equal(validateFeedUrl('https://feeds.example.com/rss', hosts).hostname, 'feeds.example.com');
  for (const url of ['http://feeds.example.com/rss', 'https://user:pass@feeds.example.com/rss', 'https://feeds.example.com:8080/', 'https://evil.example/', 'file:///etc/passwd', 'https://127.0.0.1/', 'https://feeds.example.com.evil.example/']) {
    assert.throws(() => validateFeedUrl(url, hosts), url);
  }
});
test('private, local, mapped IPv4 and reserved addresses are rejected', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('owner token checks fail closed', () => {
  assert.equal(authorized(undefined, 'secret'), false);
  assert.equal(authorized('Bearer ', ''), false);
  assert.equal(authorized('Bearer wrong', 'secret'), false);
  assert.equal(authorized('Bearer secret', 'secret'), true);
});
test('rate limits expire and cannot grow beyond their capacity', () => {
  const limits = new RateLimiter(2, 100, 1);
  assert.equal(limits.allow('a', 0), true);
  assert.equal(limits.allow('a', 1), true);
  assert.equal(limits.allow('a', 2), false);
  assert.equal(limits.allow('b', 3), false);
  assert.equal(limits.allow('b', 100), true);
});
test('article identities do not collide for common title prefixes', () => {
  assert.notEqual(articleId('source', 'Critical flaw in product A'), articleId('source', 'Critical flaw in product B'));
  assert.equal(articleId('source', 'https://example.com/a'), articleId('source', 'https://example.com/a'));
});
test('AI requests accept IDs, validate question types and reject legacy article payloads', () => {
  assert.throws(() => validateAiRequest({ dispatch: { id: 'a', title: 'untrusted' } }));
  assert.throws(() => validateAiRequest({ articleId: 'a', question: 123 }, true));
  assert.throws(() => validateAiRequest({ articleId: 'a', question: 'x'.repeat(1001) }, true));
  assert.throws(() => validateAiRequest({ articleId: 'a', forceRegenerate: 'true' }));
  assert.equal(validateAiRequest({ articleId: 'a', question: ' Why? ' }, true).question, 'Why?');
});
const valid = {
  plainEnglishSummary: 'Summary', realWorldAnalogy: 'Analogy', attackSteps: ['a', 'b', 'c'],
  whyItMatters: 'Impact', personalProtectionTip: 'Tip',
  jargonDecoder: ['a', 'b', 'c'].map(term => ({ term, definition: 'Definition' })),
  quiz: { question: 'Question?', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'Reason' },
};
test('AI guide validation rejects missing fields, incorrect arrays and invalid quiz indices', () => {
  assert.deepEqual(validateGuide(valid), valid);
  for (const value of [{}, null, { ...valid, attackSteps: 'bad' }, { ...valid, attackSteps: ['a'] }, { ...valid, quiz: { ...valid.quiz, correctIndex: 3 } }]) assert.throws(() => validateGuide(value));
});
test('AI cache expires, evicts old entries and keys include content and model', () => {
  const cache = new GuideCache(1, 100);
  cache.set('a', valid, 0);
  assert.deepEqual(cache.get('a', 99), valid);
  assert.equal(cache.get('a', 100), undefined);
  cache.set('a', valid, 100);
  cache.set('b', valid, 100);
  assert.equal(cache.get('a', 101), undefined);
  const article = { id: 'a', title: 'Original' } as any;
  assert.notEqual(guideKey(article, 'model'), guideKey({ ...article, title: 'Changed' }, 'model'));
  assert.notEqual(guideKey(article, 'model'), guideKey(article, 'other-model'));
});
