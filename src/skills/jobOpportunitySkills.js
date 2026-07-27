import { defineTextSkill, parseJsonFromMarkdown, stripCodeBlock } from './core'
import { buildJobOpportunityPrompt, getJobOpportunitySystem } from '../prompts/jobOpportunity'

export const jobOpportunityParseSkill = defineTextSkill({
  id: 'job.opportunity.parse',
  name: '岗位解析',
  description: '从 JD 或岗位信息中提取公司、岗位、要求、关键词、简历定制重点和面试准备重点。',
  version: '0.1.0',
  outputType: 'json',
  validateInput: input => {
    if (!input?.jdText?.trim()) return '请先粘贴 JD 或岗位信息。'
    return true
  },
  buildSystemPrompt: () => getJobOpportunitySystem(),
  buildUserMessage: input => buildJobOpportunityPrompt(input),
  parseResult: text => ({
    markdown: stripCodeBlock(text, 'json'),
    job: parseJsonFromMarkdown(text),
  }),
  validateResult: result => {
    if (!result?.job) return 'JD 解析没有返回可识别的 JSON，请重试。'
    if (!Array.isArray(result.job.requirements)) return 'JD 解析结果缺少岗位要求数组，请重试。'
    if (!Array.isArray(result.job.responsibilities)) return 'JD 解析结果缺少岗位职责数组，请重试。'
    if (!Array.isArray(result.job.keywords)) return 'JD 解析结果缺少关键词数组，请重试。'
    if (!Array.isArray(result.job.resumeFocus)) return 'JD 解析结果缺少简历定制重点数组，请重试。'
    if (!Array.isArray(result.job.interviewFocus)) return 'JD 解析结果缺少面试准备重点数组，请重试。'
    return true
  },
})
