import { defineTextSkill } from './core'
import { EXPERIENCE_OPENING, EXPERIENCE_SYSTEM, getExperienceSectionRewriteSystem } from '../prompts/experience'

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
    input.currentDossierPreview ? `\n【右侧经历档案草稿摘要】\n${input.currentDossierPreview}` : '',
    '',
    '【用户本轮输入】',
    input.message || '',
  ].filter(Boolean).join('\n'),
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
