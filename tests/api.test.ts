import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('production API rejects unauthorized, malformed and oversized requests and serves built assets', async (t) => {
  const portServer = createServer().listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const token = 'test-only-owner-token-with-at-least-32-characters';
  const child = spawn(process.execPath, ['build/server.js', '--production'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), OWNER_ACCESS_TOKEN: token, GEMINI_API_KEY: 'test-placeholder-no-provider-calls', GEMINI_MODEL: 'test-model' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, 'production server starts without tsx');
  const post = (path: string, body: unknown, auth = true) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/sources', {}, false)).status, 401);
  assert.equal((await post('/api/ai/explain', {}, false)).status, 401);
  assert.equal((await post('/api/sources', { name: 'Bad', feedUrl: 'https://127.0.0.1/', publisherType: 'Community Feed' })).status, 400);
  assert.equal((await post('/api/ai/explain', { dispatch: { id: 'dispatch-cve-2026-41892', title: 'Poisoned' } })).status, 400);
  assert.equal((await post('/api/ai/ask', { articleId: 'dispatch-cve-2026-41892', question: 5 })).status, 400);
  assert.equal((await post('/api/ai/explain', { articleId: 'missing-article' })).status, 404);
  assert.equal((await post('/api/sources', { name: 'x'.repeat(20000) })).status, 413);
  const malformed = await fetch(base + '/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  const home = await fetch(base + '/');
  assert.match(await home.text(), /Sentinel Wire/);
  const image = await fetch(base + '/images/featured_zero_day_datacenter_1793628778962.jpg');
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.ok((await image.arrayBuffer()).byteLength > 1000);
});
