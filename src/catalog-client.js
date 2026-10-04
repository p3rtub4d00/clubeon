export async function request(url, options = {}) {
  const owner = url.startsWith('/api/catalog/owner/')
  const res = await fetch(url, { ...options, credentials: owner ? 'include' : 'omit', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(owner ? { 'x-catalog-request': '1' } : {}), ...options.headers } })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir. Tente novamente.'), { status: res.status })
  return data
}
