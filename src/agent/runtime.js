import { streamChat } from '../services/llm'
import { createAgentTools, getToolManifest } from './tools'
import { getAgentMemory } from './memory'
import { formatAgentWorkspaceSnapshot, getAgentWorkspaceSnapshot } from './state'

const TOOL_BLOCK_RE = /```agent-tool-call\s*([\s\S]*?)\s*```/i
const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/i
const MAX_AGENT_STEPS = 4

const TOOL_ALIASES = {
  'memory.save': 'memory.save_note',
  'experience.read': 'experiences.read',
  'experience.save': 'experiences.save',
  'resume.read': 'resumes.read',
  'resume.save': 'resumes.save',
  'job.read': 'jobs.read',
  'job.save': 'jobs.save',
  'skill.execute': 'skill.run',
  'skill.call': 'skill.run',
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function compactLongText(text, limit = 7000) {
  if (typeof text !== 'string' || text.length <= limit) return text
  return `${text.slice(0, limit)}\n\n[内容较长，已在 Agent 内部截断给模型继续推理；如果这个结果已发布，页面收到的是完整版本。]`
}

function compactToolResultForModel(result) {
  if (typeof result === 'string') return compactLongText(result)
  if (!result || typeof result !== 'object') return result
  const next = { ...result }
  if (typeof next.text === 'string') next.text = compactLongText(next.text)
  if (typeof next.content === 'string') next.content = compactLongText(next.content)
  if (typeof next.results === 'string') next.results = compactLongText(next.results, 5000)
  return next
}

function toModelMessages(messages) {
  return (messages || []).map(message => ({
    role: message.role,
    content: message.content,
  }))
}

export function stripAgentToolBlocks(text) {
  return (text || '')
    .replace(/```agent-tool-call[\s\S]*?```/gi, '')
    .replace(/```agent-tool-call[\s\S]*$/gi, '')
    .trim()
}

function normalizeToolName(name = '') {
  const trimmed = String(name || '').trim()
  return TOOL_ALIASES[trimmed] || trimmed
}

function cleanJsonText(text = '') {
  return text
    .trim()
    .replace(/^[“”"]|[“”"]$/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
}

function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(cleanJsonText(text))
  } catch {
    return null
  }
}

function extractJsonObjects(text = '') {
  const objects = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return objects
}

function normalizeToolCallPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const nested = payload.tool && typeof payload.tool === 'object' ? payload.tool : null
  const rawName = nested?.name || nested?.tool || payload.tool || payload.name || payload.toolName
  const tool = normalizeToolName(rawName)
  if (!tool) return null
  const rawArgs = payload.args ?? payload.arguments ?? payload.input ?? nested?.args ?? nested?.arguments ?? {}
  const args = typeof rawArgs === 'string'
    ? (tryParseJson(rawArgs) || { text: rawArgs })
    : (rawArgs || {})
  return {
    tool,
    args,
    reason: payload.reason || payload.why || payload.purpose || '',
    rawTool: rawName,
  }
}

function parseToolCall(text) {
  if (!text) return null

  const candidates = []
  const agentBlock = text.match(TOOL_BLOCK_RE)
  if (agentBlock?.[1]) candidates.push(agentBlock[1])

  const jsonBlock = text.match(JSON_BLOCK_RE)
  if (jsonBlock?.[1]) candidates.push(jsonBlock[1])

  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) candidates.push(trimmed)
  candidates.push(...extractJsonObjects(text))

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate)
    const toolCall = normalizeToolCallPayload(parsed)
    if (toolCall) return toolCall
  }
  return null
}

function looksLikeToolAttempt(text = '') {
  return /agent-tool-call|"tool"\s*:|"name"\s*:|"arguments"\s*:|工具名|调用工具|toolName/i.test(text)
}

function latestUserText(history = []) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (message?.role === 'user' && !message.hidden) return message.content || ''
  }
  return ''
}

function inferAgentIntent({ text = '', context = {} } = {}) {
  const source = String(text || '').trim()
  const saysNoSkill = /(不要|不用|先别|暂时别).{0,8}(调用|使用)?\s*(skill|工具|生成|保存|更新|回写)|只.{0,6}(聊|分析|讨论|判断|建议)/i.test(source)
  const asksMemory = /(记住|保存偏好|以后都|长期记住|我的目标是|我的偏好是)/.test(source)
  const productionVerb = '(?:生成|产出|输出|写一版|做一版|整理成|改写成|重写|优化成|制作|创建)'
  const modifyVerb = '(?:保存|更新|覆盖|改名|回写|归档|写入|存到|沉淀到)'
  const asksProduction = new RegExp(
    `^(?:请|现在|直接|开始|继续|按照[^，。]{0,20})?\\s*(?:帮我|给我|替我|你来)?\\s*${productionVerb}|(?:帮我|给我|替我|请你|你来).{0,16}${productionVerb}|(?:调用|使用)\\s*skill`,
    'i'
  ).test(source)
  const asksModify = new RegExp(
    `^(?:请|现在|直接|确认)?\\s*(?:帮我|给我|替我)?\\s*${modifyVerb}|(?:帮我|给我|替我|请你).{0,12}${modifyVerb}`
  ).test(source)
  const asksSearch = /(搜索|查一下|查下|最新|官网|新闻|业务|公司信息|竞品|融资|招聘信息|岗位信息)/.test(source)
  const asksPlanning = /(下一步|优先|取舍|规划|建议|诊断|还缺|够不够|适不适合|匹配|怎么准备|怎么选)/.test(source)

  if (saysNoSkill) {
    return {
      mode: 'discussion',
      canUseSkill: false,
      canPublishArtifact: false,
      canModifyData: asksMemory,
      canSearch: asksSearch,
      reason: '用户明确表达先聊、分析或不要调用生产工具。',
    }
  }

  if (asksProduction) {
    return {
      mode: 'production',
      canUseSkill: true,
      canPublishArtifact: true,
      canModifyData: asksModify || asksMemory,
      canSearch: asksSearch,
      reason: '用户表达了生成、改写、输出完整材料等生产意图。',
    }
  }

  if (asksModify || asksMemory) {
    return {
      mode: 'data_update',
      canUseSkill: false,
      canPublishArtifact: false,
      canModifyData: true,
      canSearch: asksSearch,
      reason: '用户表达了保存、更新或长期记忆意图，但没有要求生成完整材料。',
    }
  }

  if (asksPlanning || asksSearch) {
    return {
      mode: 'diagnosis',
      canUseSkill: false,
      canPublishArtifact: false,
      canModifyData: false,
      canSearch: asksSearch,
      reason: '用户更像在做判断、诊断、规划或信息查询。',
    }
  }

  return {
    mode: 'discussion',
    canUseSkill: false,
    canPublishArtifact: false,
    canModifyData: false,
    canSearch: false,
    reason: '没有明确生产任务，默认作为顾问式讨论处理。',
  }
}

function buildToolFormatCorrection({ full, tools, reason }) {
  const names = Object.keys(tools).join('、')
  return [
    reason || '上一次输出看起来是在调用工具，但格式不稳定。',
    '请只输出一个 agent-tool-call 代码块，不要附加解释文字。',
    `可用工具名：${names}`,
    '格式：',
    '```agent-tool-call',
    '{"tool":"工具名","args":{},"reason":"为什么需要这个工具"}',
    '```',
    '',
    '上一次原始输出：',
    full.slice(0, 1200),
  ].join('\n')
}

function compactContext(context = {}) {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (entries.length === 0) return '当前没有额外页面上下文。'
  return entries.map(([key, value]) => {
    if (typeof value === 'string') {
      return `- ${key}: ${value.length > 1200 ? value.slice(0, 1200) + '...[已截断]' : value}`
    }
    if (Array.isArray(value)) {
      const samples = value.slice(0, 4).map(item => {
        if (typeof item === 'string') return item.slice(0, 80)
        return item?.title || item?.name || item?.company || item?.role || '对象'
      }).join('；')
      return `- ${key}: 数组 ${value.length} 项${samples ? `，示例：${samples}` : ''}`
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value).slice(0, 10).join('、')
      return `- ${key}: 对象字段：${keys}`
    }
    return `- ${key}: ${String(value)}`
  }).join('\n')
}

function summarizeMemory(memory) {
  const preferences = (memory.preferences || []).slice(0, 8)
  const goals = (memory.goals || []).slice(0, 8)
  const notes = (memory.notes || []).slice(0, 8).map(note => typeof note === 'string' ? note : note.text).filter(Boolean)
  if (!preferences.length && !goals.length && !notes.length) return '暂无长期记忆。'

  return [
    preferences.length ? `偏好：${preferences.join('；')}` : '',
    goals.length ? `目标：${goals.join('；')}` : '',
    notes.length ? `备注：${notes.join('；')}` : '',
    memory.updatedAt ? `更新时间：${memory.updatedAt}` : '',
  ].filter(Boolean).join('\n')
}

function buildAgentSystemPrompt({ tools, context, memory, localState, intentGate }) {
  const manifest = getToolManifest(tools)
  return `你是「职序」里的全局 AI 助手，不是单页聊天助手。

你的任务：
1. 理解用户当前处在求职链路的哪一步：简历导入、经历调研、经历资产、选岗位方向、简历版本、岗位、面试准备。
2. 必要时主动调用工具读取用户已有资料；只有意图闸门允许时才调用专业 skill 或写入数据。
3. 先回答用户此刻真正问的问题。只有用户在问规划、诊断或下一步时，才给行动建议。
4. 不要编造用户本地资料；需要资料时先读取工具。
5. 普通聊天不调用独立搜索工具。公开信息补充只在生成简历、面试手册或知识体系时由对应 skill 的生成链路自动完成。
6. 如果用户让你记住偏好、目标、长期背景，调用 memory.save_note。
7. 会修改归档数据的动作要谨慎。除非用户明确要求保存，否则不要调用写入类工具。
   - 标记为“必须等待用户确认”的工具，只能先发起工具调用；系统会暂停并展示确认按钮。
   - 用户确认前，不要假装已经保存、更新或覆盖。
   - 可保存的数据包括基础信息、经历资产、简历版本、岗位、长期记忆。
   - 不提供删除工具；如果用户要求删除，只能建议用户在对应页面手动删除。
8. 专业 skill 是生产工具，不是理解用户问题的前置步骤。只有用户明确要求产出对应材料时才调用；不确定时先继续澄清，不要为了展示能力调用 skill.catalog。
9. 如果当前页面上下文里有 artifactTarget，且你调用 skill 得到了完整的页面结果，工具会自动尝试发布；如果你自己整理出了完整结果，也可以调用 artifact.publish 发布到页面。
10. 需要判断当前页面已有草稿时，先调用 workspace.read。

全局 Agent 的意图闸门：
- 当前意图：${intentGate?.mode || 'discussion'}
- 判断原因：${intentGate?.reason || '默认讨论'}
- 是否允许调用专业 skill：${intentGate?.canUseSkill ? '允许' : '不允许'}
- 是否允许回写页面结果：${intentGate?.canPublishArtifact ? '允许' : '不允许'}
- 是否允许修改归档数据：${intentGate?.canModifyData ? '允许，但仍需确认' : '不允许'}
- 页面允许调用 skill 只代表能力可用，不代表用户本轮要求调用。
- 如果当前只是聊天、分析、判断、吐槽、比较、求建议，不要强行调用 skill。直接结合工作区快照回答；需要更多细节时可调用只读工具。
- 只有用户明确要求“生成/改写/整理成完整材料/输出简历版本/生成面试手册/生成知识体系/保存更新”时，才进入生产或写入流程。
- 对不明确的需求，先回答或澄清，不要固定追加“需要的话我再帮你生成完整版本”。

可用工具：
${manifest.map(tool => `- ${tool.name}: ${tool.description}\n  参数示例：${tool.argsHint}`).join('\n')}

调用工具时，只输出一个 fenced JSON 块，不要附加其它文字：
\`\`\`agent-tool-call
{"tool":"工具名","args":{},"reason":"为什么需要这个工具"}
\`\`\`

拿到工具结果后，继续思考并给用户正常回答。最终回答不要包含 agent-tool-call 代码块。

当前页面上下文：
${compactContext(context)}

长期记忆：
${summarizeMemory(memory)}

工作区快照（这是本轮开始时的真实本地状态，优先依据它识别对象和进度）：
${localState}

语言风格：
- 用中文。
- 直接、清楚、像一个产品里的求职协作 Agent。
- 提到用户资料时使用具体经历、简历或岗位名称，不要只说“你的经历”“当前材料”。
- 明确区分已确认事实、合理判断和待补信息。
- 不复述内部工具、Skill、意图闸门等实现概念，除非用户明确询问产品架构。
- 不要使用 emoji。
- 如果正在给方案，优先说明“先做什么”和“为什么”。`
}

export async function runAgentTurn({
  userText,
  history = [],
  settings,
  context = {},
  refreshAppState,
  onToken,
  onToolEvent,
}) {
  return continueAgentTurn({
    history: [...history, { role: 'user', content: userText.trim() }],
    settings,
    context,
    refreshAppState,
    onToken,
    onToolEvent,
  })
}

export async function continueAgentTurn({
  history = [],
  settings,
  context = {},
  refreshAppState,
  onToken,
  onToolEvent,
}) {
  if (!settings?.provider || !settings?.apiKey || !settings?.model) {
    throw new Error('请先设置 API Key')
  }

  const intentGate = inferAgentIntent({ text: latestUserText(history), context })
  const tools = createAgentTools({ settings, refreshAppState, context, intentGate })
  const workspaceSnapshot = getAgentWorkspaceSnapshot(context)
  const system = buildAgentSystemPrompt({
    tools,
    context,
    memory: getAgentMemory(),
    localState: formatAgentWorkspaceSnapshot(workspaceSnapshot),
    intentGate,
  })
  const messages = [...history]
  const toolEvents = []
  let visibleText = ''

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    let full = ''
    const gen = streamChat({
      ...settings,
      system,
      messages: toModelMessages(messages),
    })

    for await (const chunk of gen) {
      full += chunk
      const cleaned = stripAgentToolBlocks(full)
      visibleText = cleaned
      onToken?.(cleaned, chunk)
    }

    const toolCall = parseToolCall(full)
    if (!toolCall) {
      if (looksLikeToolAttempt(full) && step < MAX_AGENT_STEPS - 1) {
        messages.push({ role: 'assistant', content: full, hidden: true })
        messages.push({
          role: 'user',
          hidden: true,
          content: buildToolFormatCorrection({ full, tools }),
        })
        continue
      }
      const assistantMessage = { role: 'assistant', content: full }
      return {
        messages: [...messages, assistantMessage],
        text: stripAgentToolBlocks(full),
        toolEvents,
      }
    }

    const tool = tools[toolCall.tool]
    if (!tool) {
      const event = {
        id: `${Date.now()}-${step}`,
        tool: toolCall.tool,
        reason: toolCall.reason,
        status: 'error',
        error: `未知工具：${toolCall.rawTool || toolCall.tool}`,
      }
      toolEvents.push(event)
      onToolEvent?.(event)

      if (step < MAX_AGENT_STEPS - 1) {
        messages.push({ role: 'assistant', content: full, hidden: true })
        messages.push({
          role: 'user',
          hidden: true,
          content: buildToolFormatCorrection({
            full,
            tools,
            reason: `工具 ${toolCall.rawTool || toolCall.tool} 不存在。请改用可用工具。`,
          }),
        })
        continue
      }

      const fallback = `我刚才尝试调用一个还没有接入的工具：${toolCall.rawTool || toolCall.tool}。这次没有修改任何数据，你可以换一种说法让我继续。`
      return {
        messages: [...messages, { role: 'assistant', content: fallback }],
        text: fallback,
        toolEvents,
      }
    }

    const event = {
      id: `${Date.now()}-${step}`,
      tool: toolCall.tool,
      reason: toolCall.reason,
      status: tool?.requiresApproval ? 'approval' : 'running',
    }
    toolEvents.push(event)
    onToolEvent?.(event)

    if (tool?.requiresApproval) {
      const label = tool.approvalLabel || toolCall.tool
      const approvalText = `需要你确认后再执行：${label}。\n\n原因：${toolCall.reason || '这个操作会修改已保存的数据。'}`
      return {
        messages: [...messages, { role: 'assistant', content: approvalText }],
        text: approvalText,
        toolEvents,
        pendingApproval: {
          id: event.id,
          tool: toolCall.tool,
          args: toolCall.args,
          reason: toolCall.reason,
          label,
        },
      }
    }

    let result
    try {
      result = await tool.run(toolCall.args)
      event.status = 'done'
      event.result = result
    } catch (err) {
      event.status = 'error'
      event.error = err.message
      result = { error: err.message }
    }
    onToolEvent?.({ ...event })

    messages.push({ role: 'assistant', content: full, hidden: true })
    messages.push({
      role: 'user',
      hidden: true,
      content: `工具 ${toolCall.tool} 的结果如下：\n\`\`\`json\n${safeJson(compactToolResultForModel(result))}\n\`\`\`\n请基于这个结果继续。如果还需要其他工具，可以继续调用；如果信息足够，请给用户最终回答。`,
    })
  }

  const fallback = visibleText || '我已经尝试调用工具，但这次没有形成稳定结果。你可以换一种说法再试一次。'
  return {
    messages: [...messages, { role: 'assistant', content: fallback }],
    text: fallback,
    toolEvents,
  }
}

export async function runApprovedAgentTool({
  approval,
  settings,
  context = {},
  refreshAppState,
}) {
  if (!settings?.provider || !settings?.apiKey || !settings?.model) {
    throw new Error('请先设置 API Key')
  }
  const tools = createAgentTools({
    settings,
    refreshAppState,
    context,
    intentGate: {
      canUseSkill: true,
      canPublishArtifact: true,
      canModifyData: true,
    },
  })
  const tool = tools[approval?.tool]
  if (!tool) throw new Error(`未知工具：${approval?.tool}`)
  if (!tool.requiresApproval) throw new Error('这个工具不需要确认执行。')
  const result = await tool.run(approval.args || {})
  return {
    tool: approval.tool,
    label: tool.approvalLabel || approval.label || approval.tool,
    result,
  }
}
