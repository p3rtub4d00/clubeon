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

test('owner sessions stay in HttpOnly cookie; gateway blocks cross-origin writes and never forwards master credentials', async () => {
  let call
  const app = createApp({ upstream: 'https://master.example.com', fetcher: async (url, options) => { call = { url, options }; return new Response(JSON.stringify(url.endsWith('/login') ? { ok: true, sessionToken: 'owner-test-session' } : { ok: true }), { headers: { 'Content-Type': 'application/json' } }) } })
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = 'http://127.0.0.1:' + server.address().port
  try {
    const path = '/api/catalog/owner/login', payload = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-catalog-request': '1' }, body: JSON.stringify({ phone: '69999990000', password: 'test-password' }) }
    assert.equal((await fetch(base + path, { ...payload, headers: { 'Content-Type': 'application/json' } })).status, 403)
    assert.equal((await fetch(base + path, { ...payload, headers: { ...payload.headers, Origin: 'https://attacker.example.com' } })).status, 403)
    const login = await fetch(base + path, payload); assert.equal(login.status, 200); assert.deepEqual(await login.json(), { ok: true })
    const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\//)
    const session = cookie.split(';')[0]
    await fetch(base + '/api/catalog/owner/entries/test-id', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-catalog-request': '1', Cookie: session + '; espacoon_master=master-secret', Authorization: 'Bearer attacker', 'x-catalog-owner-session': 'forged' }, body: JSON.stringify({ name: 'Update' }) })
    assert.equal(call.options.method, 'PUT'); assert.equal(call.options.headers['x-catalog-owner-session'], 'owner-test-session'); assert.equal(call.options.headers.Cookie, undefined); assert.equal(call.options.headers.Authorization, undefined); assert.equal(JSON.parse(call.options.body).name, 'Update')
    await fetch(base + '/api/catalog', { headers: { Cookie: session } }); assert.equal(call.options.headers['x-catalog-owner-session'], undefined)
    const logout = await fetch(base + '/api/catalog/owner/logout', { ...payload, headers: { ...payload.headers, Cookie: session }, body: '{}' }); assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/)
    assert.equal((await fetch(base + '/api/catalog/owner/arbitrary')).status, 404)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
