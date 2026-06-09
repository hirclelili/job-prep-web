export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: [{ id: 'deepseek-chat', name: 'DeepSeek V3（推荐）' }],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.deepseek.com 获取',
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini（便宜）' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.openai.com 获取',
  },
  moonshot: {
    name: 'Kimi（月之暗面）',
    baseURL: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-32k', name: 'Moonshot 32K' },
      { id: 'moonshot-v1-128k', name: 'Moonshot 128K' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 platform.moonshot.cn 获取',
  },
  qwen: {
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-plus', name: 'Qwen Plus（便宜）' },
    ],
    format: 'openai',
    placeholder: 'sk-xxxxxxxx',
    hint: '在 dashscope.console.aliyun.com 获取',
  },
  claude: {
    name: 'Claude（Anthropic）',
    baseURL: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku（便宜）' },
    ],
    format: 'anthropic',
    placeholder: 'sk-ant-xxxxxxxx',
    hint: '在 console.anthropic.com 获取',
  },
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

// Anthropic streaming
async function* streamAnthropic({ apiKey, model, messages, system }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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

export async function* streamChat({ provider, apiKey, model, messages, system }) {
  const p = PROVIDERS[provider]
  if (!p) throw new Error(`Unknown provider: ${provider}`)
  if (p.format === 'anthropic') {
    yield* streamAnthropic({ apiKey, model, messages, system })
  } else {
    yield* streamOpenAI({ baseURL: p.baseURL, apiKey, model, messages, system })
  }
}
