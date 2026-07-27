import { defineTextSkill, extractCodeBlock, hasMinimumText } from './core'
import { getBattlePlanSystem, getKnowledgeAppendSystem, getKnowledgeSystem, getSectionRewriteSystem } from '../prompts/battlePlan'
import { streamChat } from '../services/llm'

function hasUsefulMarkdown(text) {
  return hasMinimumText(text, 100)
}

function normalizeKnowledgeTitle(value = '') {
  return value
    .replace(/\*\*/g, '')
    .replace(/^[#\s]+/, '')
    .replace(/^模块(?:[一二三四五六七八九十\d]+)?[：:]\s*/, '')
    .replace(/^\d+[.、]\s*/, '')
    .replace(/[\s【】[\]（）()《》"'“”‘’：:·,，。.!！?？/\\_-]/g, '')
    .toLowerCase()
}

function parseKnowledgeBodyModules(text) {
  const markdown = text.replace(/```mindmap-json[\s\S]*?```/i, '')
  const headingPattern = /^#\s+模块(?:[一二三四五六七八九十\d]+)?[：:]\s*(.+)$/gm
  const headings = [...markdown.matchAll(headingPattern)]

  return headings.map((match, index) => {
    const start = match.index + match[0].length
    const end = headings[index + 1]?.index ?? markdown.indexOf('\n# 应用场景总览', start)
    const content = markdown.slice(start, end >= 0 ? end : markdown.length)
    const concepts = [...content.matchAll(/^##\s+(?:\d+[.、]\s*)?(.+)$/gm)]
      .map(concept => concept[1].trim())
    return {
      title: match[1].trim(),
      concepts,
    }
  })
}

function titlesMatch(left, right) {
  const a = normalizeKnowledgeTitle(left)
  const b = normalizeKnowledgeTitle(right)
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)))
}

function validateKnowledgeStructure(text) {
  if (!hasUsefulMarkdown(text)) return '知识体系生成内容过短。'
  if (!text.includes('```mindmap-json')) return '知识体系缺少思维导图数据。'

  const mindmapSource = extractCodeBlock(text, 'mindmap-json')
  let mindmap
  try {
    mindmap = JSON.parse(mindmapSource)
  } catch {
    return '知识体系的思维导图 JSON 无法解析。'
  }

  if (!Array.isArray(mindmap.modules) || mindmap.modules.length < 2 || mindmap.modules.length > 4) {
    return '思维导图必须包含 2-4 个知识模块。'
  }

  const invalidConceptCount = mindmap.modules.find(module => (
    !module?.title ||
    !Array.isArray(module.concepts) ||
    module.concepts.length < 2 ||
    module.concepts.length > 3
  ))
  if (invalidConceptCount) {
    return `模块“${invalidConceptCount?.title || '未命名模块'}”必须包含 2-3 个核心概念。`
  }

  const totalConcepts = mindmap.modules.reduce((sum, module) => sum + module.concepts.length, 0)
  if (totalConcepts > 10) return '思维导图的核心概念总数不能超过 10 个。'

  const bodyModules = parseKnowledgeBodyModules(text)
  if (bodyModules.length !== mindmap.modules.length) {
    return `思维导图有 ${mindmap.modules.length} 个模块，但正文只完整输出了 ${bodyModules.length} 个模块。`
  }

  for (let index = 0; index < mindmap.modules.length; index += 1) {
    const mapModule = mindmap.modules[index]
    const bodyModule = bodyModules[index]
    if (!titlesMatch(mapModule.title, bodyModule.title)) {
      return `正文第 ${index + 1} 个模块“${bodyModule.title}”与思维导图“${mapModule.title}”不一致。`
    }
    if (bodyModule.concepts.length !== mapModule.concepts.length) {
      return `模块“${mapModule.title}”在思维导图中有 ${mapModule.concepts.length} 个概念，但正文展开了 ${bodyModule.concepts.length} 个。`
    }
    for (let conceptIndex = 0; conceptIndex < mapModule.concepts.length; conceptIndex += 1) {
      if (!titlesMatch(mapModule.concepts[conceptIndex], bodyModule.concepts[conceptIndex])) {
        return `模块“${mapModule.title}”中的概念“${mapModule.concepts[conceptIndex]}”没有在正文对应位置完整展开。`
      }
    }
  }

  if (!text.includes('# 应用场景总览')) return '知识体系缺少应用场景总览。'
  return true
}

async function collectStream(request) {
  let text = ''
  for await (const chunk of streamChat(request)) text += chunk
  return text
}

export const battlePlanChatSkill = defineTextSkill({
  id: 'battle_plan.manual.chat',
  name: 'JD拆解与面试手册生成',
  description: '围绕目标JD生成JD拆解、面试手册和面试准备内容。',
  version: '0.1.0',
  interaction: 'chat',
  buildSystemPrompt: input => getBattlePlanSystem(input.experiences || []),
  buildUserMessage: input => [
    input.jdText ? '【当前岗位 JD】\n' + input.jdText : '',
    input.jobTitle ? '【当前岗位】\n' + input.jobTitle : '',
    input.searchContext?.trim() ? input.searchContext.trim() : '',
    input.message ? '【用户指令】\n' + input.message : '',
  ].filter(Boolean).join('\n\n'),
})

export const knowledgeSystemSkill = defineTextSkill({
  id: 'battle_plan.knowledge.generate',
  name: '面试知识体系生成',
  description: '基于JD拆解/面试手册生成知识体系、思维导图和应用场景。',
  version: '0.3.0',
  validateInput: input => {
    if (!input?.manualText?.trim()) return '请先生成或提供面试手册/JD 拆解。'
    return true
  },
  buildSystemPrompt: input => getKnowledgeSystem(input.experiences || []),
  buildUserMessage: input => [
    '请基于以下JD拆解/面试手册，生成独立的面试知识体系模块。',
    input.searchContext?.trim() ? input.searchContext.trim() : '',
    '【JD拆解/面试手册】\n' + input.manualText,
  ].filter(Boolean).join('\n\n'),
  repairResult: async (result, _raw, input, settings) => {
    const issue = validateKnowledgeStructure(result)
    if (issue === true) return result

    return collectStream({
      ...settings,
      system: getKnowledgeSystem(input.experiences || []),
      messages: [{
        role: 'user',
        content: [
          '下面这份知识体系结构不完整，请输出修复后的完整知识体系，不要解释修复过程。',
          `【必须修复的问题】\n${issue}`,
          '【修复要求】',
          '- 重新核对 mindmap-json 与正文。',
          '- 模块数量、模块标题、模块顺序必须完全对应。',
          '- 每个模块的概念数量、概念名称、概念顺序必须完全对应。',
          '- 如果内容过长，减少思维导图中的次要概念，再完整重写正文；不能保留只有目录没有正文的内容。',
          `【待修复内容】\n${result}`,
        ].join('\n\n'),
      }],
    })
  },
  validateResult: text => {
    const validation = validateKnowledgeStructure(text)
    return validation === true ? true : `${validation} 已自动修复一次但仍未通过，请重新生成。`
  },
})

export const knowledgeAppendSkill = defineTextSkill({
  id: 'battle_plan.knowledge.append',
  name: '知识体系补充模块',
  description: '在已有知识体系上补充一个新模块，不重写全文。',
  version: '0.2.0',
  validateInput: input => {
    if (!input?.knowledgeText?.trim()) return '请先生成知识体系，再补充模块。'
    if (!input?.topic?.trim()) return '请填写要补充的模块方向。'
    return true
  },
  buildSystemPrompt: () => getKnowledgeAppendSystem(),
  buildUserMessage: input => [
    '【要补充的模块方向】\n' + input.topic,
    input.focus ? '【补充重点】\n' + input.focus : '',
    '【面试手册】\n' + input.manualText,
    '【现有知识体系】\n' + input.knowledgeText,
  ].filter(Boolean).join('\n\n'),
  validateResult: text => {
    if (!hasUsefulMarkdown(text)) return '补充模块生成内容过短，请换一个更明确的补充方向。'
    if (!text.includes('# 模块')) return '补充内容没有按模块格式输出，请重试。'
    if (text.includes('```mindmap-json')) return '补充模块不应输出思维导图 JSON，请重试。'
    if (text.includes('# 应用场景总览')) return '补充模块不应重写应用场景总览，请重试。'
    return true
  },
})

export const sectionRewriteSkill = defineTextSkill({
  id: 'battle_plan.section.rewrite',
  name: '章节/模块局部优化',
  description: '只重写面试手册章节或知识体系模块，生成预览后再替换。',
  version: '0.1.0',
  validateInput: input => {
    if (!input?.title?.trim()) return '缺少要优化的章节标题。'
    if (!input?.sectionMarkdown?.trim()) return '缺少要优化的原文内容。'
    if (!input?.instruction?.trim()) return '请填写优化要求。'
    return true
  },
  buildSystemPrompt: input => getSectionRewriteSystem(input.type),
  buildUserMessage: input => [
    '【优化要求】\n' + input.instruction,
    '【当前标题】\n' + input.title,
    '【当前内容】\n' + input.sectionMarkdown,
    input.type === 'manual'
      ? '【完整面试手册上下文】\n' + input.manualText
      : '【完整知识体系上下文】\n' + input.knowledgeText,
  ].join('\n\n'),
  validateResult: text => {
    if (!hasUsefulMarkdown(text)) return '优化结果过短，请补充更具体的优化要求后重试。'
    if (text.includes('<!-- MANUAL_COMPLETE -->')) return '局部优化结果不应包含完成标记，请重试。'
    if (text.includes('```json') || text.includes('```mindmap-json')) return '局部优化结果不应包含 JSON 代码块，请重试。'
    return true
  },
})
