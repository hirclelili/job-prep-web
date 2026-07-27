import { defineTextSkill, parseJsonFromMarkdown, stripCodeBlock } from './core'
import { buildExperienceAssetPrompt, getExperienceAssetSystem } from '../prompts/asset'

export const experienceAssetStructuringSkill = defineTextSkill({
  id: 'experience.asset.structure',
  name: '经历资产整理',
  description: '把原始经历、简历条目或调研记录整理成可保存、可复用的经历资产 JSON。',
  version: '0.1.0',
  outputType: 'json',
  validateInput: input => {
    if (!input?.rawText?.trim() && !input?.currentAsset) return '请先提供原始经历、简历条目或已有经历资产。'
    return true
  },
  buildSystemPrompt: () => getExperienceAssetSystem(),
  buildUserMessage: input => buildExperienceAssetPrompt(input),
  parseResult: text => ({
    markdown: stripCodeBlock(text, 'json'),
    asset: parseJsonFromMarkdown(text),
  }),
  validateResult: result => {
    if (!result?.asset) return '经历资产整理没有返回可识别的 JSON，请重试。'
    if (!Array.isArray(result.asset.resume_bullets)) return '经历资产缺少简历条目数组，请重试。'
    if (!Array.isArray(result.asset.skills_demonstrated)) return '经历资产缺少能力标签数组，请重试。'
    if (!Array.isArray(result.asset.open_questions)) return '经历资产缺少待补充问题数组，请重试。'
    return true
  },
})
