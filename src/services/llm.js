export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash（推荐）' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro（质量更好）' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.deepseek.com 获取',
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra（推荐）' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol（质量优先）' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna（成本优先）' },
    ],
    format: 'openai-responses',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.openai.com 获取',
  },
  moonshot: {
    name: 'Kimi（月之暗面）',
    baseURL: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2.6', name: 'Kimi K2.6（推荐）' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.moonshot.cn 获取',
  },
  qwen: {
    name: '阿里云百炼 / 千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus（推荐）' },
      { id: 'qwen3.7-max', name: 'Qwen 3.7 Max（质量优先）' },
      { id: 'qwen3.6-flash', name: 'Qwen 3.6 Flash（成本优先）' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 dashscope.console.aliyun.com 获取',
  },
  claude: {
    name: 'Claude（Anthropic）',
    baseURL: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5（推荐）' },
      { id: 'claude-opus-5', name: 'Claude Opus 5（质量优先）' },
      { id: 'claude-fable-5', name: 'Claude Fable 5（长任务）' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5（成本优先）' },
    ],
    format: 'anthropic',
    placeholder: 'sk-ant-xxxxxxxx',
    hint: '在 console.anthropic.com 获取',
  },
  gemini: {
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash（推荐）' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite（成本优先）' },
    ],
    format: 'openai',
    placeholder: 'AIzaSyxxxxxxxx',
    hint: '在 Google AI Studio 获取',
  },
  zhipu: {
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5.2', name: 'GLM-5.2（推荐）' },
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-5-turbo', name: 'GLM-5 Turbo（速度优先）' },
    ],
    format: 'openai',
    placeholder: 'xxxxxxxx.xxxxxxxx',
    hint: '在 open.bigmodel.cn 获取',
  },
  minimax: {
    name: 'MiniMax',
    baseURL: 'https://api.minimaxi.com/v1',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7（推荐）' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed' },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5（成本优先）' },
    ],
    format: 'openai',
    placeholder: 'xxxxxxxx',
    hint: '在 platform.minimaxi.com 获取',
  },
  doubao: {
    name: '火山方舟 / 豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [],
    format: 'openai',
    placeholder: 'xxxxxxxx',
    hint: '填写方舟 API Key，模型处使用推理接入点 ID',
  },
  hunyuan: {
    name: '腾讯混元',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [],
    format: 'openai',
    placeholder: 'xxxxxxxx',
    hint: '在腾讯云混元控制台获取',
  },
  siliconflow: {
    name: '硅基流动 SiliconFlow',
    baseURL: 'https://api.siliconflow.cn/v1',
    models: [],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 cloud.siliconflow.cn 获取',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: [],
    format: 'openai',
    placeholder: 'sk-or-v1-xxxxxxxx',
    hint: '在 openrouter.ai 获取',
  },
}

const trimBaseURL = value => String(value || '').trim().replace(/\/+$/, '')

export function getProviderConfig(settings = {}) {
  if (settings.provider === 'custom') {
    return {
      name: settings.providerName?.trim() || '自定义接口',
      baseURL: trimBaseURL(settings.baseURL),
      format: settings.format === 'anthropic' ? 'anthropic' : 'openai',
      models: [],
      placeholder: '输入 API Key',
      hint: 'API Key 只保存在当前浏览器',
    }
  }
  return PROVIDERS[settings.provider] || PROVIDERS.deepseek
}

function buildHeaders({ format, apiKey }) {
  if (format === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function parseApiError(status, raw = '') {
  let detail = raw
  try {
    const parsed = JSON.parse(raw)
    detail = parsed.error?.message || parsed.message || raw
  } catch {}
  if (status === 401 || status === 403) return `API Key 无效或没有访问权限。${detail ? ` ${detail}` : ''}`
  if (status === 404) return `接口地址或模型不存在。${detail ? ` ${detail}` : ''}`
  if (status === 429) return `请求过于频繁、额度不足或账户受限。${detail ? ` ${detail}` : ''}`
  return `连接失败（${status}）。${detail || '请检查接口地址和模型 ID。'}`
}

export async function fetchAvailableModels(settings) {
  const provider = getProviderConfig(settings)
  if (!provider.baseURL) throw new Error('请先填写 API 地址')
  if (!settings.apiKey?.trim()) throw new Error('请先填写 API Key')

  const endpoint = provider.format === 'anthropic'
    ? `${provider.baseURL}/v1/models`
    : `${provider.baseURL}/models`
  let res
  try {
    res = await fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders({ format: provider.format, apiKey: settings.apiKey.trim() }),
    })
  } catch {
    throw new Error('浏览器无法访问模型列表。可以直接填写模型 ID，或检查该服务商是否允许网页跨域访问。')
  }
  if (!res.ok) throw new Error(parseApiError(res.status, await res.text()))

  const payload = await res.json()
  const rows = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []
  const models = rows
    .map(item => {
      const id = typeof item === 'string' ? item : item.id || item.name
      if (!id) return null
      return {
        id: String(id).replace(/^models\//, ''),
        name: item.display_name || item.displayName || item.name || id,
      }
    })
    .filter(Boolean)
  if (!models.length) throw new Error('接口已连接，但没有返回可选择的模型。请手动填写模型 ID。')
  return models
}

export async function testLLMConnection(settings) {
  const provider = getProviderConfig(settings)
  const apiKey = settings.apiKey?.trim()
  const model = settings.model?.trim()
  if (!provider.baseURL) throw new Error('请填写 API 地址')
  if (!apiKey) throw new Error('请填写 API Key')
  if (!model) throw new Error('请选择或填写模型 ID')

  let endpoint
  let body
  if (provider.format === 'anthropic') {
    endpoint = `${provider.baseURL}/v1/messages`
    body = {
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: '只回复 OK' }],
    }
  } else if (provider.format === 'openai-responses') {
    endpoint = `${provider.baseURL}/responses`
    body = {
      model,
      max_output_tokens: 8,
      input: '只回复 OK',
    }
  } else {
    endpoint = `${provider.baseURL}/chat/completions`
    body = {
      model,
      max_tokens: 8,
      stream: false,
      messages: [{ role: 'user', content: '只回复 OK' }],
    }
  }

  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders({ format: provider.format, apiKey }),
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('浏览器无法连接该接口。请检查 API 地址，或确认服务商允许网页直接访问。')
  }
  if (!res.ok) throw new Error(parseApiError(res.status, await res.text()))
  return true
}

// OpenAI-compatible streaming
async function* streamOpenAI({ baseURL, apiKey, model, messages, system }) {
  const body = {
    model,
    stream: true,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API Error ${res.status}: ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const text = json.choices?.[0]?.delta?.content
        if (text) yield text
      } catch {}
    }
  }
}

async function* streamOpenAIResponses({ baseURL, apiKey, model, messages, system }) {
  const input = [
    ...(system ? [{ role: 'developer', content: system }] : []),
    ...messages,
  ]
  const res = await fetch(`${baseURL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input, stream: true }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API Error ${res.status}: ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        if (json.type === 'response.output_text.delta' && json.delta) yield json.delta
      } catch {}
    }
  }
}

// Anthropic streaming
async function* streamAnthropic({ baseURL, apiKey, model, messages, system }) {
  const res = await fetch(`${baseURL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      ...(system ? { system } : {}),
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API Error ${res.status}: ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text
          if (text) yield text
        }
      } catch {}
    }
  }
}

export async function* streamChat({ provider, providerName, baseURL, format, apiKey, model, messages, system }) {
  const p = getProviderConfig({ provider, providerName, baseURL, format })
  if (!p.baseURL) throw new Error('请先在 API 设置中填写接口地址')
  const normalizedModel = provider === 'deepseek' && model === 'deepseek-chat'
    ? 'deepseek-v4-flash'
    : model
  if (p.format === 'anthropic') {
    yield* streamAnthropic({ baseURL: p.baseURL, apiKey, model: normalizedModel, messages, system })
  } else if (p.format === 'openai-responses') {
    yield* streamOpenAIResponses({ baseURL: p.baseURL, apiKey, model: normalizedModel, messages, system })
  } else {
    yield* streamOpenAI({ baseURL: p.baseURL, apiKey, model: normalizedModel, messages, system })
  }
}
