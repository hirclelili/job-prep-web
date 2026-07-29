import { defineTextSkill, parseJsonFromMarkdown } from './core'
import {
  EXPERIENCE_DOSSIER_SYSTEM,
  EXPERIENCE_EVIDENCE_SYSTEM,
  EXPERIENCE_OPENING,
  EXPERIENCE_OVERVIEW_SYSTEM,
  EXPERIENCE_PROJECT_DOSSIER_SYSTEM,
  EXPERIENCE_PROJECT_STORY_SYSTEM,
  EXPERIENCE_RESEARCH_STATE_SYSTEM,
  EXPERIENCE_SYSTEM,
  getExperienceSectionRewriteSystem,
} from '../prompts/experience'
import { streamChat } from '../services/llm'

function validateDossierOutput(text, input) {
  const required = [
    '# 完整经历档案',
    '## 第一部分：经历档案底稿',
    '## 第二部分：简历版',
    '## 第三部分：完整经历故事',
    '## 第四部分：面试工具包',
    '```json',
  ]
  if (!text || text.trim().length < 1800) return '生成的经历档案过短，没有充分继承调研信息。'
  if (required.some(marker => !text.includes(marker))) return '生成的经历档案结构不完整。'
  const missingProject = (input?.evidence?.projects || [])
    .map(project => project.name)
    .filter(Boolean)
    .find(name => !text.includes(name))
  if (missingProject) return `生成结果遗漏了项目“${missingProject}”。`
  return true
}

async function repairDossierOutput(text, input, settings) {
  const issue = validateDossierOutput(text, input)
  if (issue === true) return text
  const messages = [{
    role: 'user',
    content: [
      `上一次生成存在问题：${issue}`,
      '请重新生成完整档案，不要解释修复过程。',
      `【生成模式】${input.mode === 'enhanced' ? '增强模式' : '精准模式'}`,
      '【结构化事实底稿】',
      JSON.stringify(input.evidence || {}, null, 2),
      '【上一次结果，仅供检查遗漏】',
      text || '',
    ].join('\n\n'),
  }]
  let repaired = ''
  const gen = streamChat({
    ...settings,
    system: EXPERIENCE_DOSSIER_SYSTEM,
    messages,
  })
  for await (const chunk of gen) repaired += chunk
  return repaired.trim() || text
}

export const experienceDeepDiveSkill = defineTextSkill({
  id: 'experience.deep_dive.chat',
  name: '单段经历深挖',
  description: '通过多轮采访深挖一段经历，并产出完整经历档案与可复用素材。',
  version: '0.1.0',
  interaction: 'chat',
  opening: EXPERIENCE_OPENING,
  buildSystemPrompt: () => EXPERIENCE_SYSTEM,
  buildUserMessage: input => [
    '【当前经历档案状态】',
    input.currentOutputStatus || 'no_dossier',
    input.archiveStatusExplanation || '聊天记录不代表已经生成完整经历档案，也不代表已经保存归档。',
    `是否已有对话调研进度：${input.hasChatProgress || 'no'}`,
    '硬规则：判断是否完成或归档时，只能看本段状态说明，不要根据聊天历史推断。',
    input.currentResearchState?.projects?.length
      ? `\n【当前结构化调研状态】\n${JSON.stringify(input.currentResearchState, null, 2)}\n本轮必须在此基础上累计或修正事实，并在回答末尾返回最新完整状态快照。`
      : '',
    input.currentDossierPreview ? `\n【右侧经历档案草稿摘要】\n${input.currentDossierPreview}` : '',
    '',
    '【用户本轮输入】',
    input.message || '',
  ].filter(Boolean).join('\n'),
})

export const experienceResearchStateSynthesisSkill = defineTextSkill({
  id: 'experience.research_state.synthesize',
  name: '经历调研状态整理',
  description: '在调研回复缺少状态数据时，根据当前对话修复结构化事实快照。',
  version: '0.1.0',
  buildSystemPrompt: () => EXPERIENCE_RESEARCH_STATE_SYSTEM,
  buildUserMessage: input => [
    '【已有结构化状态】',
    JSON.stringify(input.currentState || {}, null, 2),
    '【完整可见调研对话】',
    input.transcript || '',
  ].join('\n\n'),
  parseResult: text => parseJsonFromMarkdown(text),
  validateResult: result => {
    if (!result || typeof result !== 'object') return '没有成功恢复调研状态。'
    if (!Array.isArray(result.projects)) return '调研状态缺少项目列表。'
    return true
  },
})

export const experienceEvidenceSynthesisSkill = defineTextSkill({
  id: 'experience.evidence.synthesize',
  name: '经历调研事实整理',
  description: '从完整调研对话中提取用户已经确认的事实，为档案生成提供结构化底稿。',
  version: '0.2.0',
  buildSystemPrompt: () => EXPERIENCE_EVIDENCE_SYSTEM,
  buildUserMessage: input => [
    `【生成模式】${input.mode === 'enhanced' ? '增强模式' : '精准模式'}`,
    '【完整调研对话】',
    input.transcript || '',
  ].join('\n\n'),
  parseResult: text => parseJsonFromMarkdown(text),
  validateResult: result => {
    if (!result || typeof result !== 'object') return '没有成功整理调研事实，请重试。'
    if (!Array.isArray(result.projects) || result.projects.length === 0) {
      return '没有识别到本次调研覆盖的项目，请继续补充后再生成。'
    }
    return true
  },
})

export const experienceDossierGenerateSkill = defineTextSkill({
  id: 'experience.dossier.generate',
  name: '完整经历档案生成',
  description: '严格依据已确认事实底稿，生成细致的经历档案、简历表达和面试材料。',
  version: '0.2.0',
  buildSystemPrompt: () => EXPERIENCE_DOSSIER_SYSTEM,
  buildUserMessage: input => [
    `【生成模式】${input.mode === 'enhanced' ? '增强模式' : '精准模式'}`,
    '【结构化事实底稿】',
    JSON.stringify(input.evidence || {}, null, 2),
    '请完整保留底稿中的具体信息，并按固定结构生成。',
  ].join('\n\n'),
  repairResult: repairDossierOutput,
  validateResult: (text, _full, input) => validateDossierOutput(text, input),
})

export const experienceOverviewGenerateSkill = defineTextSkill({
  id: 'experience.overview.generate',
  name: '经历总览与简历表达生成',
  description: '基于完整事实底稿生成经历总览、项目索引和整段经历简历 bullet。',
  version: '0.1.0',
  buildSystemPrompt: () => EXPERIENCE_OVERVIEW_SYSTEM,
  buildUserMessage: input => [
    `【生成模式】${input.mode === 'enhanced' ? '增强模式' : '精准模式'}`,
    '【结构化事实底稿】',
    JSON.stringify(input.evidence || {}, null, 2),
  ].join('\n\n'),
  validateResult: text => {
    if (!text?.includes('#### 基础信息') || !text.includes('#### 简历表达')) {
      return '经历总览结构不完整。'
    }
    if (/```json|```/.test(text)) return '经历总览不应包含代码块。'
    return true
  },
})

export const experienceProjectDossierGenerateSkill = defineTextSkill({
  id: 'experience.project_dossier.generate',
  name: '项目详细档案生成',
  description: '逐项目生成详细职责、贡献边界以及行动与决策链。',
  version: '0.1.0',
  buildSystemPrompt: () => EXPERIENCE_PROJECT_DOSSIER_SYSTEM,
  buildUserMessage: input => [
    `【生成模式】${input.mode === 'enhanced' ? '增强模式' : '精准模式'}`,
    '【经历基本信息】',
    JSON.stringify(input.identity || {}, null, 2),
    '【整段经历定位】',
    input.mainline || '',
    '【当前项目事实】',
    JSON.stringify(input.project || {}, null, 2),
  ].join('\n\n'),
  validateResult: text => {
    const required = ['#### 业务现场与目标', '#### 我的职责', '#### 行动与决策链', '#### 结果与证据']
    if (required.some(marker => !text?.includes(marker))) return '项目档案结构不完整。'
    if (/```json|```/.test(text)) return '项目档案不应包含代码块。'
    return true
  },
})

export const experienceProjectStoryGenerateSkill = defineTextSkill({
  id: 'experience.project_story.generate',
  name: '项目面试故事生成',
  description: '基于单个项目档案生成详细面试故事和针对性追问。',
  version: '0.1.0',
  buildSystemPrompt: () => EXPERIENCE_PROJECT_STORY_SYSTEM,
  buildUserMessage: input => [
    '【经历基本信息】',
    JSON.stringify(input.identity || {}, null, 2),
    `【项目名称】\n${input.project?.name || '当前项目'}`,
    '【结构化项目事实】',
    JSON.stringify(input.project || {}, null, 2),
    '【已生成的项目档案】',
    input.projectDossier || '',
  ].join('\n\n'),
  validateResult: text => {
    if (!text?.includes('#### 详细面试故事') || !text.includes('#### 面试追问')) {
      return '项目面试故事结构不完整。'
    }
    if (/```json|```/.test(text)) return '项目面试故事不应包含代码块。'
    return true
  },
})

export const experienceSectionRewriteSkill = defineTextSkill({
  id: 'experience.section.rewrite',
  name: '经历档案局部优化',
  description: '只重写经历档案中的某个成品块，生成预览后再替换。',
  version: '0.1.0',
  validateInput: input => {
    if (!input?.title?.trim()) return '缺少要优化的标题。'
    if (!input?.sectionMarkdown?.trim()) return '缺少要优化的原文内容。'
    if (!input?.instruction?.trim()) return '请填写优化要求。'
    return true
  },
  buildSystemPrompt: input => getExperienceSectionRewriteSystem(input.type),
  buildUserMessage: input => [
    '【优化要求】\n' + input.instruction,
    '【当前标题】\n' + input.title,
    '【当前内容】\n' + input.sectionMarkdown,
    input.fullDossier ? '【完整经历档案上下文】\n' + input.fullDossier : '',
  ].filter(Boolean).join('\n\n'),
  validateResult: text => {
    if (!text?.trim() || text.trim().length < 40) return '优化结果过短，请补充更具体的优化要求后重试。'
    if (text.includes('```json') || text.includes('```')) return '局部优化结果不应包含代码块，请重试。'
    return true
  },
})
