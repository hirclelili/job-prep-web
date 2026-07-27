import { defineTextSkill, parseJsonFromMarkdown } from './core'
import { buildParsePrompt, RESUME_PARSER_SYSTEM } from '../prompts/resumeParser'
import { normalizeParsedResumeResult } from '../utils/resumeNormalize'

export const resumeParserSkill = defineTextSkill({
  id: 'resume.parse.profile_and_experiences',
  name: '简历基础信息与经历解析',
  description: '从简历全文中解析基础信息、教育、技能和经历 JSON。',
  version: '0.2.0',
  outputType: 'json',
  validateInput: input => {
    if (!input?.resumeText?.trim()) return '请先上传或粘贴简历文本。'
    if (input.resumeText.trim().length < 80) return '简历文本太短，无法可靠解析。'
    return true
  },
  buildSystemPrompt: () => RESUME_PARSER_SYSTEM,
  buildUserMessage: input => buildParsePrompt(input.resumeText),
  parseResult: text => normalizeParsedResumeResult(parseJsonFromMarkdown(text)),
  validateResult: result => {
    if (!result) return 'AI 没有返回可识别的 JSON，请重试或改用粘贴文本导入。'
    if (!result.profile || typeof result.profile !== 'object') return 'AI 返回的简历结构不完整，缺少基础信息。'
    if (!Array.isArray(result.experiences)) return 'AI 返回的简历结构不完整，缺少经历列表。'
    if (result.experiences.some(exp => !Array.isArray(exp.bullets))) return 'AI 返回的经历结构不完整，缺少 bullets 数组。'
    return true
  },
})
