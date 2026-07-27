const SEARCH_CACHE_PREFIX = 'job_prep_search_cache:'
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function compactText(value = '', limit = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function stableHash(value = '') {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function readCache(query) {
  try {
    const raw = localStorage.getItem(`${SEARCH_CACHE_PREFIX}${stableHash(query)}`)
    const item = raw ? JSON.parse(raw) : null
    if (!item || Date.now() - item.createdAt > SEARCH_CACHE_TTL_MS) return null
    return item.payload || null
  } catch {
    return null
  }
}

function writeCache(query, payload) {
  try {
    localStorage.setItem(`${SEARCH_CACHE_PREFIX}${stableHash(query)}`, JSON.stringify({
      createdAt: Date.now(),
      payload,
    }))
  } catch {}
}

export async function searchPublicWeb({
  query,
  limit = 4,
  useCache = true,
} = {}) {
  const normalizedQuery = compactText(query, 320)
  if (!normalizedQuery) throw new Error('缺少搜索关键词')

  if (useCache) {
    const cached = readCache(normalizedQuery)
    if (cached) return { ...cached, cached: true }
  }

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: normalizedQuery, limit }),
    })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) throw new Error('搜索接口尚未在当前环境启用')
    const data = await response.json()
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || `搜索失败（${response.status}）`)
    }
    if (data.skipped) return data
    if (useCache) writeCache(normalizedQuery, data)
    return data
  } catch (error) {
    throw error
  }
}

function findLabeledValue(text = '', labels = []) {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[：:]\\s*([^\\n]{2,80})`, 'i'))
    if (match?.[1]) return compactText(match[1], 80)
  }
  return ''
}

export function inferJobSearchIdentity({ jobTitle = '', jdText = '', targetLabel = '' } = {}) {
  const cleanTitle = compactText(jobTitle, 120)
  const titleParts = cleanTitle.split(/\s*[·｜|]\s*/).filter(Boolean)
  const companyFromJd = findLabeledValue(jdText, ['公司(?:名称)?', 'Company'])
  const roleFromJd = findLabeledValue(jdText, ['岗位(?:名称)?', '职位(?:名称)?', 'Position', 'Job\\s*Title'])
  const company = companyFromJd || (titleParts.length > 1 ? titleParts[0] : '')
  const role = roleFromJd || (titleParts.length > 1 ? titleParts.slice(1).join(' ') : cleanTitle) || compactText(targetLabel, 80)

  return {
    company: compactText(company, 80),
    role: compactText(role, 100),
  }
}

function buildEnrichmentQuery({ purpose, company, role }) {
  const subject = [company, role].filter(Boolean).join(' ')
  if (purpose === 'interview') {
    return `${subject} 公司业务 岗位职责 招聘要求 面试重点`
  }
  return `${subject} 招聘 岗位职责 任职要求 业务关键词`
}

export function formatSearchContext(data) {
  if (!data || data.skipped || !Array.isArray(data.results) || data.results.length === 0) return ''
  const lines = [
    '【公开信息补充】',
    '以下内容来自公开网页，只能用于理解公司、业务和同类岗位要求；可能存在时效误差。',
    '不得把公开信息写成用户亲自完成的项目、职责、数据或成果。用户经历事实仍以经历资产和简历原文为唯一依据。',
  ]
  if (data.answer) lines.push(`公开摘要：${compactText(data.answer, 1600)}`)
  data.results.slice(0, 5).forEach((item, index) => {
    const title = compactText(item.title || `来源${index + 1}`, 180)
    const content = compactText(item.content, 900)
    const url = compactText(item.url, 1000)
    lines.push([
      `来源${index + 1}：${title}`,
      content ? `摘要：${content}` : '',
      url ? `链接：${url}` : '',
    ].filter(Boolean).join('\n'))
  })
  return lines.join('\n\n')
}

export async function getJobSearchEnrichment({
  purpose = 'resume',
  jobTitle = '',
  jdText = '',
  targetLabel = '',
} = {}) {
  const identity = inferJobSearchIdentity({ jobTitle, jdText, targetLabel })
  if (!identity.company && !identity.role) {
    return { skipped: true, reason: 'missing_job_identity', contextText: '' }
  }
  if (!jdText.trim() && (!identity.role || /通用|未命名/.test(identity.role))) {
    return { skipped: true, reason: 'too_generic', contextText: '' }
  }

  const query = buildEnrichmentQuery({ purpose, ...identity })
  try {
    const data = await searchPublicWeb({ query, limit: 4 })
    return {
      ...data,
      identity,
      contextText: formatSearchContext(data),
    }
  } catch (error) {
    return {
      skipped: true,
      reason: 'search_unavailable',
      message: error.message,
      identity,
      contextText: '',
    }
  }
}
