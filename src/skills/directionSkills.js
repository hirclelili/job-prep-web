import { defineTextSkill, hasMinimumText } from './core'
import { buildDirectionAnalysisPrompt, getDirectionAnalysisSystem } from '../prompts/direction'

export const directionAnalysisSkill = defineTextSkill({
  id: 'direction.analyze.fit',
  name: '岗位方向分析',
  description: '基于经历资产分析适合优先尝试的岗位方向、证据、短板和下一步行动。',
  version: '0.1.0',
  validateInput: input => {
    if (!input?.experiences?.length) return '请先准备至少一条经历资产，再分析岗位方向。'
    return true
  },
  buildSystemPrompt: () => getDirectionAnalysisSystem(),
  buildUserMessage: input => buildDirectionAnalysisPrompt(input),
  validateResult: text => {
    if (!hasMinimumText(text, 220)) return '方向分析内容过短，请重试。'
    if (!text.includes('## 方向优先级')) return '方向分析缺少优先级判断，请重试。'
    if (!text.includes('## 经历资产缺口')) return '方向分析缺少经历资产缺口，请重试。'
    if (!text.includes('## 下一步行动')) return '方向分析缺少下一步行动，请重试。'
    return true
  },
})
