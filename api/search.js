const DEFAULT_LIMIT = 4
const MAX_LIMIT = 6
const QUERY_MAX_LENGTH = 320
const CACHE_TTL_MS = 30 * 60 * 1000
const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 24

const runtimeState = globalThis.__JOB_PREP_SEARCH_STATE__ || {
  cache: new Map(),
  rateLimits: new Map(),
}
globalThis.__JOB_PREP_SEARCH_STATE__ = runtimeState

function setCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '')
  const host = String(req.headers.host || '')
  try {
    if (origin && new URL(origin).host === host) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
  } catch {}
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

function isRateLimited(req) {
  const now = Date.now()
  const key = getClientKey(req)
  const current = runtimeState.rateLimits.get(key)

  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    runtimeState.rateLimits.set(key, { startedAt: now, count: 1 })
    return false
  }

  current.count += 1
  return current.count > RATE_LIMIT
}

function normalizeResult(item = {}) {
  return {
    title: String(item.title || item.name || '').trim().slice(0, 180),
    url: String(item.url || item.link || '').trim().slice(0, 1200),
    content: String(item.content || item.description || item.snippet || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200),
  }
}

async function fetchWithTimeout(url, options, timeoutMs = 8500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function searchTavily({ apiKey, query, limit }) {
  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: limit,
      include_answer: true,
      include_raw_content: false,
    }),
  })
  if (!response.ok) throw new Error(`Tavily 搜索失败（${response.status}）`)
  const data = await response.json()
  return {
    answer: String(data.answer || '').trim().slice(0, 1800),
    results: (data.results || []).map(normalizeResult).filter(item => item.title || item.content),
  }
}

async function searchBrave({ apiKey, query, limit }) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))
  url.searchParams.set('safesearch', 'moderate')

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  })
  if (!response.ok) throw new Error(`Brave 搜索失败（${response.status}）`)
  const data = await response.json()
  return {
    answer: '',
    results: (data.web?.results || []).map(normalizeResult).filter(item => item.title || item.content),
  }
}

async function searchSerper({ apiKey, query, limit }) {
  const response = await fetchWithTimeout('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: limit }),
  })
  if (!response.ok) throw new Error(`Serper 搜索失败（${response.status}）`)
  const data = await response.json()
  return {
    answer: String(data.answerBox?.answer || data.knowledgeGraph?.description || '').trim().slice(0, 1800),
    results: (data.organic || []).map(normalizeResult).filter(item => item.title || item.content),
  }
}

async function runProviderSearch({ provider, apiKey, query, limit }) {
  if (provider === 'brave') return searchBrave({ apiKey, query, limit })
  if (provider === 'serper') return searchSerper({ apiKey, query, limit })
  return searchTavily({ apiKey, query, limit })
}

export default async function handler(req, res) {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }
  if (isRateLimited(req)) {
    res.status(429).json({ ok: false, error: 'rate_limited', message: '搜索请求过于频繁，请稍后重试。' })
    return
  }

  const apiKey = process.env.SEARCH_API_KEY
  const provider = String(process.env.SEARCH_PROVIDER || 'tavily').trim().toLowerCase()
  if (!apiKey) {
    res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'not_configured',
      results: [],
    })
    return
  }
  if (!['tavily', 'brave', 'serper'].includes(provider)) {
    res.status(500).json({ ok: false, error: 'unsupported_provider' })
    return
  }

  const query = String(req.body?.query || '').replace(/\s+/g, ' ').trim()
  const limit = Math.min(Math.max(Number(req.body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  if (query.length < 2 || query.length > QUERY_MAX_LENGTH) {
    res.status(400).json({ ok: false, error: 'invalid_query' })
    return
  }

  const cacheKey = `${provider}:${limit}:${query.toLowerCase()}`
  const cached = runtimeState.cache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    res.status(200).json({ ...cached.payload, cached: true })
    return
  }

  try {
    const data = await runProviderSearch({ provider, apiKey, query, limit })
    const payload = {
      ok: true,
      query,
      provider,
      answer: data.answer,
      results: data.results.slice(0, limit),
      fetchedAt: new Date().toISOString(),
    }
    runtimeState.cache.set(cacheKey, { createdAt: Date.now(), payload })
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
    res.status(200).json(payload)
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '搜索服务响应超时'
      : (error?.message || '搜索服务暂时不可用')
    res.status(502).json({ ok: false, error: 'provider_error', message })
  }
}
