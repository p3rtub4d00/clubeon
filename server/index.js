import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function masterBase(value, production = false) {
  const url = new URL(value)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && !production && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('MASTER_API_URL deve conter apenas a origem HTTPS pública do painel master.')
  return url.origin
}
export function gatewayPath(method, pathname) {
  return method === 'GET' && (pathname === '/api/catalog' || pathname === '/api/catalog/meta' || /^\/api\/catalog\/entries\/[\w-]{1,64}$/.test(pathname) || /^\/api\/catalog\/photos\/[\w-]{1,64}\/[0-5]$/.test(pathname)) || method === 'POST' && pathname === '/api/catalog/submissions'
}
export function ownerGatewayPath(method, pathname) {
  return method === 'POST' && ['/api/catalog/owner/access-request', '/api/catalog/owner/login', '/api/catalog/owner/activate', '/api/catalog/owner/logout'].includes(pathname)
    || method === 'GET' && ['/api/catalog/owner/session', '/api/catalog/owner/entries'].includes(pathname)
    || method === 'GET' && /^\/api\/catalog\/owner\/photos\/[\w-]{1,64}\/[0-5]$/.test(pathname)
    || ['PUT', 'DELETE'].includes(method) && /^\/api\/catalog\/owner\/entries\/[\w-]{1,64}$/.test(pathname)
}
export function createApp({ upstream = process.env.MASTER_API_URL, fetcher = fetch } = {}) {
  const origin = upstream ? masterBase(upstream, process.env.NODE_ENV === 'production') : null
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'blob:', 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }))
  app.use(express.json({ limit: '1mb' }))
  app.post('/api/catalog/submissions', rateLimit({ windowMs: 3600000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitos cadastros neste período. Tente novamente mais tarde.' } }))
  for (const endpoint of ['login', 'activate', 'access-request']) app.post('/api/catalog/owner/' + endpoint, rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' } }))
  app.use('/api/catalog/owner', rateLimit({ windowMs: 15 * 60000, limit: 150, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas solicitações. Tente novamente em 15 minutos.' } }))
  app.use('/api/catalog', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const pathname = req.originalUrl.split('?')[0], owner = pathname.startsWith('/api/catalog/owner/')
    if (!(owner ? ownerGatewayPath(req.method, pathname) : gatewayPath(req.method, pathname))) return res.status(404).json({ error: 'Página não encontrada.' })
    if (owner && req.method !== 'GET' && (req.get('x-catalog-request') !== '1' || (req.get('origin') && req.get('origin') !== req.protocol + '://' + req.get('host')))) return res.status(403).json({ error: 'Requisição inválida. Abra o catálogo e tente novamente.' })
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-clubeon_owner' : 'clubeon_owner'
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 12 * 3600000 }
    if (owner && pathname.endsWith('/logout')) { res.clearCookie(cookieName, cookieOptions); return res.json({ ok: true }) }
    if (!origin) return res.status(503).json({ error: 'O catálogo está em preparação. Tente novamente em breve.' })
    try {
      if (Object.keys(req.query).some(key => /[\[\]]/.test(key))) return res.status(400).json({ error: 'Filtro inválido.' })
      const query = new URLSearchParams()
      for (const key of ['q', 'city', 'state', 'type', 'category', 'amenities', 'page']) {
        const value = req.query[key]
        if (value !== undefined) {
          if (typeof value !== 'string' || value.length > 100) return res.status(400).json({ error: 'Filtro inválido.' })
          query.set(key, value)
        }
      }
      const session = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || ''
      const hasBody = ['POST', 'PUT', 'DELETE'].includes(req.method)
      const response = await fetcher(origin + pathname + (query.size ? '?' + query : ''), { method: req.method, signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: pathname.includes('/photos/') ? 'image/jpeg' : 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(owner && session && session.length < 4096 ? { 'x-catalog-owner-session': session } : {}) }, ...(hasBody ? { body: JSON.stringify(req.body) } : {}) })
      const contentType = response.headers.get('content-type') || ''
      if (pathname.includes('/photos/') && response.ok && contentType.startsWith('image/jpeg')) return res.type('jpeg').send(Buffer.from(await response.arrayBuffer()))
      if (!contentType.includes('application/json')) throw new Error('Resposta inválida do master')
      const data = await response.json()
      if (owner && response.ok && ['/api/catalog/owner/login', '/api/catalog/owner/activate'].includes(pathname)) {
        if (typeof data.sessionToken !== 'string' || data.sessionToken.length > 4096) throw new Error('Sessão inválida')
        res.cookie(cookieName, data.sessionToken, cookieOptions)
      }
      if (owner) { delete data.sessionToken; if (response.status === 401) res.clearCookie(cookieName, cookieOptions) }
      res.status(response.status).json(data)
    } catch { res.status(502).json({ error: 'Não foi possível carregar o catálogo. Tente novamente em instantes.' }) }
  })
  app.get('/api/health', (_req, res) => res.json({ ok: true, catalogConfigured: !!origin }))
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Página não encontrada.' }))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  app.use(express.static(path.join(root, 'dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')))
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'Fotos acima do limite. Selecione novamente.' : 'Requisição inválida.' }))
  return app
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.MASTER_API_URL) throw new Error('Configure MASTER_API_URL com o endereço do painel master antes de iniciar.')
  createApp().listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('Catálogo ClubeOn iniciado.'))
}
