import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { createApp, gatewayPath, masterBase } from '../server/index.js'

test('gateway permits only public catalog operations, never administration or arbitrary paths', () => {
  for (const path of ['/api/catalog', '/api/catalog/meta', '/api/catalog/entries/business-id', '/api/catalog/photos/business-id/0']) assert.equal(gatewayPath('GET', path), true)
  assert.equal(gatewayPath('POST', '/api/catalog/submissions'), true)
  for (const path of ['/api/master/catalog', '/api/catalog/../master/login', '/api/catalog/photos/id/8', '/api/catalog/submissions', '/api/catalog/anything', '/api/catalog/photos/id/0/more']) assert.equal(!!gatewayPath('GET', path), false)
  assert.equal(!!gatewayPath('PUT', '/api/catalog'), false)
})
test('upstream must be an origin without credentials; HTTP is local development only', () => {
  assert.equal(masterBase('https://master.example.com/'), 'https://master.example.com')
  assert.equal(masterBase('http://127.0.0.1:10001'), 'http://127.0.0.1:10001')
  for (const value of ['http://master.example.com', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com?url=other', 'ftp://example.com']) assert.throws(() => masterBase(value))
  assert.throws(() => masterBase('http://127.0.0.1', true))
})
test('gateway strips credentials and rejects nested filters and redirected HTML responses', async () => {
  let call
  const app = createApp({ upstream: 'https://master.example.com', fetcher: async (url, options) => { call = { url, options }; return new Response(JSON.stringify({ entries: [] }), { headers: { 'Content-Type': 'application/json' } }) } })
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = 'http://127.0.0.1:' + server.address().port
  try {
    const response = await fetch(base + '/api/catalog?city=Porto%20Velho&secret=hidden', { headers: { Cookie: 'master=secret', Authorization: 'Bearer secret' } })
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(call.url, 'https://master.example.com/api/catalog?city=Porto+Velho'); assert.equal(call.options.headers.Cookie, undefined); assert.equal(call.options.headers.Authorization, undefined); assert.equal(call.options.redirect, 'error')
    assert.equal((await fetch(base + '/api/catalog?city[$ne]=x')).status, 400)
    assert.equal((await fetch(base + '/api/master/catalog')).status, 404)
    assert.equal((await fetch(base + '/api/catalog/submissions', { method: 'PUT' })).status, 404)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
test('unconfigured gateway reports availability without showing fictitious listings', async () => {
  const server = createApp({ upstream: '' }).listen(0, '127.0.0.1'); await once(server, 'listening')
  try { const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/catalog'); assert.equal(res.status, 503); assert.match((await res.json()).error, /preparação/) } finally { await new Promise(resolve => server.close(resolve)) }
})
