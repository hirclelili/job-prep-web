import { streamChat } from '../services/llm'

export function defineTextSkill(config) {
  return {
    version: '0.1.0',
    outputType: 'markdown',
    validateInput: null,
    validateResult: null,
    ...config,
  }
}

export function extractCodeBlock(text, language) {
  if (!text) return ''
  const lang = language ? language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[\\w-]*'
  const match = text.match(new RegExp('```' + lang + '\\s*([\\s\\S]*?)\\s*```', 'i'))
  return match?.[1]?.trim() || ''
}

export function parseJsonFromMarkdown(text) {
  const fenced = extractCodeBlock(text, 'json')
  const raw = fenced || text?.trim() || ''
  try { return JSON.parse(raw) } catch {}

  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (!objectMatch) return null
  try { return JSON.parse(objectMatch[0]) } catch { return null }
}

export function stripCodeBlock(text, language) {
  if (!text) return ''
  const lang = language ? language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[\\w-]*'
  return text.replace(new RegExp('```' + lang + '[\\s\\S]*?```', 'gi'), '').trim()
}

export function hasMinimumText(text, minLength = 120) {
  return typeof text === 'string' && text.trim().length >= minLength
}

export async function runTextSkill({ skill, input, settings, onToken }) {
  if (!skill?.buildSystemPrompt || !skill?.buildUserMessage) {
    throw new Error('Invalid skill: missing prompt builders')
  }
  if (!settings?.provider || !settings?.apiKey || !settings?.model) {
    throw new Error('请先设置 API Key')
  }
  if (skill.validateInput) {
    const validation = skill.validateInput(input || {})
    if (validation !== true) {
      throw new Error(typeof validation === 'string' ? validation : '输入信息不完整，请补充后重试')
    }
  }

  const message = skill.buildUserMessage(input)
  const messages = Array.isArray(message) ? message : [{ role: 'user', content: message }]
  const gen = streamChat({
    ...settings,
    system: skill.buildSystemPrompt(input),
    messages,
  })

  let full = ''
  for await (const chunk of gen) {
    full += chunk
    onToken?.(full, chunk)
  }

  let result = skill.parseResult ? skill.parseResult(full, input) : full
  if (skill.repairResult) {
    result = await skill.repairResult(result, full, input, settings)
    onToken?.(result, '')
  }
  if (skill.validateResult) {
    const validation = skill.validateResult(result, full, input)
    if (validation !== true) {
      throw new Error(typeof validation === 'string' ? validation : 'AI 输出格式不符合预期，请重试')
    }
  }
  return result
}

export function buildChatSkillRuntime(skill, input = {}) {
  if (!skill?.buildSystemPrompt) return { systemPrompt: '', initialMessage: null }
  return {
    systemPrompt: skill.buildSystemPrompt(input),
    initialMessage: skill.opening || null,
  }
}
