import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
test('PWA has stable identity, scope, standalone launch and real icons with the declared dimensions', async () => {
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose.includes('maskable')))
  for (const size of [180, 192, 512]) {
    const data = await readFile(new URL('../public/icons/icon-' + size + '.png', import.meta.url))
    assert.equal(data.subarray(1, 4).toString(), 'PNG')
    assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size)
  }
})
function harness({ offline = false, quotaFailure = false } = {}) {
  const events = {}, writes = []
  const fallback = new Response('offline help', { headers: { 'Content-Type': 'text/html' } })
  const good = new Response('fresh response'); Object.defineProperty(good, 'type', { value: 'basic' })
  const cache = { put: async (...args) => { writes.push(args); if (quotaFailure) throw new Error('quota') }, keys: async () => [], match: async () => fallback }
  const context = { self: { location: { origin: 'https://clubeon.example.com' }, addEventListener: (name, handler) => { events[name] = handler } }, caches: { open: async () => cache, match: async () => fallback }, fetch: async () => { if (offline) throw new Error('offline'); return good }, URL, Response }
  vm.runInNewContext(worker, context)
  const dispatch = (pathname, method = 'GET', mode = 'cors') => { let handled; events.fetch({ request: { method, mode, url: new URL(pathname, context.self.location.origin).href }, respondWith: promise => { handled = promise } }); return handled }
  return { dispatch, writes, fallback, good }
}
test('service worker never intercepts or caches APIs, owner data, writes, or external links', () => {
  const { dispatch, writes } = harness()
  for (const path of ['/api/catalog', '/api/catalog/owner/session', '/api/catalog/owner/entries', '/api/catalog/owner/photos/id/0', 'https://instagram.com/profile']) assert.equal(dispatch(path), undefined)
  assert.equal(dispatch('/api/catalog/submissions', 'POST'), undefined)
  assert.equal(dispatch('/assets/test.js', 'POST'), undefined)
  assert.equal(writes.length, 0)
})
test('navigation always uses fresh HTML, even for activation links; offline fallback stores no invitation', async () => {
  const online = harness(); assert.equal(await online.dispatch('/#ativar=secret', 'GET', 'navigate'), online.good); assert.equal(online.writes.length, 0)
  const offline = harness({ offline: true }); assert.equal(await offline.dispatch('/?invite=secret', 'GET', 'navigate'), offline.fallback); assert.equal(offline.writes.length, 0)
})
test('public assets have offline fallback and quota failures preserve the successful network response', async () => {
  const online = harness(); assert.equal(await online.dispatch('/assets/app-hash.js'), online.good); assert.equal(online.writes.length, 1)
  const offline = harness({ offline: true }); assert.equal(await offline.dispatch('/assets/app-hash.js'), offline.fallback)
  const full = harness({ quotaFailure: true }); assert.equal(await full.dispatch('/assets/app-hash.js'), full.good)
})
