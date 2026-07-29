const FIELD_CONFIG = [
  {
    id: 'business',
    label: '业务背景与目标',
    weight: 25,
    patterns: [
      /业务|背景|痛点|问题|为什么|起点|现状|目标用户|用户是谁|使用者|对象|场景|主线|价值|范围|项目/,
    ],
  },
  {
    id: 'action',
    label: '个人贡献与行动',
    weight: 35,
    patterns: [
      /负责|主导|参与|贡献|边界|角色|判断|决策|取舍|设计|方案|流程|方法|怎么做|如何做|推进|协作|环节|模块|动作/,
    ],
  },
  {
    id: 'evidence',
    label: '结果与证据',
    weight: 25,
    patterns: [
      /结果|数据|指标|提升|降低|上线|验证|实验|反馈|影响|产出|规模|效率|周期|转化|收益|证据|复盘/,
    ],
  },
]

function cleanText(value = '') {
  return String(value)
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[A-Z][.．、):：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getQuestionText(message = '') {
  const question = String(message).match(/(?:##\s*)?本轮问题\s*([\s\S]*?)(?=\n\s*为什么问[：:]|\n\s*选项|$)/)?.[1]
  return cleanText(question || message).slice(0, 320)
}

function isGenerationChoice(question = '') {
  return /生成完整经历档案|哪种方式生成|精准模式|增强模式/.test(question)
}

function classifyQuestion(question = '') {
  const scores = FIELD_CONFIG.map(field => ({
    id: field.id,
    score: field.patterns.reduce((total, pattern) => total + (pattern.test(question) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score)

  return scores[0]?.score > 0 ? scores[0].id : 'action'
}

function compactAnswer(answer = '') {
  const clean = cleanText(answer)
    .replace(/^(?:我选择|选择|答案是)\s*/i, '')
  if (!clean) return ''
  return clean.length > 88 ? `${clean.slice(0, 88)}…` : clean
}

function getBaseSummary(sourceExperience, messages) {
  const parts = [
    sourceExperience?.company,
    sourceExperience?.role,
    sourceExperience?.time,
  ].map(cleanText).filter(Boolean)

  if (parts.length > 0) return parts.join(' · ')

  const firstUserMessage = messages.find(message => message.role === 'user' && !message.hidden)
  const summary = compactAnswer(firstUserMessage?.content || '')
  return summary || '等待开始'
}

export function buildExperienceResearchProgress(messages = [], sourceExperience = null, options = {}) {
  const visible = messages.filter(message => !message.hidden && ['user', 'assistant'].includes(message.role))
  const answers = {
    business: [],
    action: [],
    evidence: [],
  }
  let latestField = ''

  for (let index = 0; index < visible.length; index += 1) {
    const message = visible[index]
    if (message.role !== 'user') continue

    const previousAssistant = [...visible.slice(0, index)]
      .reverse()
      .find(item => item.role === 'assistant')
    if (!previousAssistant) continue

    const question = getQuestionText(previousAssistant.content)
    if (!question || isGenerationChoice(question)) continue

    const fieldId = classifyQuestion(question)
    const answer = compactAnswer(message.content)
    if (!answer) continue

    const bucket = answers[fieldId]
    if (!bucket.includes(answer)) bucket.push(answer)
    latestField = fieldId
  }

  const hasConversation = visible.length > 0
  const baseSummary = getBaseSummary(sourceExperience, visible)
  const baseConfirmed = hasConversation || Boolean(sourceExperience)
  const fields = [
    {
      id: 'base',
      label: '基础信息',
      value: baseSummary,
      confirmed: baseConfirmed,
      highlight: latestField === 'base',
    },
    ...FIELD_CONFIG.map(field => ({
      id: field.id,
      label: field.label,
      value: answers[field.id].length > 0
        ? answers[field.id].slice(-2).join('；')
        : field.id === 'evidence' ? '待补充' : '待确认',
      confirmed: answers[field.id].length > 0,
      highlight: latestField === field.id,
    })),
  ]

  const completedWeight = (baseConfirmed ? 15 : 0)
    + FIELD_CONFIG.reduce(
      (total, field) => total + (answers[field.id].length > 0 ? field.weight : 0),
      0,
    )
  const progress = options.complete
    ? 100
    : Math.min(90, completedWeight)

  return {
    progress,
    fields,
    latestField,
    answeredCount: Object.values(answers).reduce((total, items) => total + items.length, 0),
    summary: fields
      .filter(field => field.confirmed)
      .map(field => `${field.label}：${field.value}`)
      .join('\n'),
  }
}
