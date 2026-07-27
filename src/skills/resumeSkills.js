import { defineTextSkill, hasMinimumText, parseJsonFromMarkdown } from './core'
import { streamChat } from '../services/llm'
import {
  dedupeResumeExperienceEntries,
  inferExperienceType,
  normalizeResumeChronology,
  normalizeResumeExperiencePlacement,
  normalizeResumeHeadingLevels,
  removeEmptyResumeSections,
  resumeExperienceDateScore,
} from '../utils/resumeNormalize'
import {
  buildProfileContext,
  buildOriginalResumeContext,
  buildResumeModulePlan,
  buildResumeDirectionEvidenceContext,
  buildResumeExperienceContext,
  getResumeDirectionRecommendationSystem,
  getResumeFitAnalysisSystem,
  getResumeReviewSystem,
  getResumeStrategyRefineSystem,
  getResumeVersionSystem,
} from '../prompts/resume'

function jdContext(jdText, fallback) {
  return jdText?.trim()
    ? '【目标JD/岗位描述】\n' + jdText.trim()
    : '【目标JD/岗位描述】\n' + fallback
}

function baseInput(input) {
  return [
    '【简历目标】\n' + input.targetLabel,
    '【基础信息】\n' + buildProfileContext(input.profile),
    jdContext(input.jdText, input.noJdText || '用户没有提供具体JD。'),
    input.searchContext?.trim() ? input.searchContext.trim() : null,
  ]
}

function hasUsefulMarkdown(text) {
  return hasMinimumText(text, 120)
}

function hasAnyHeading(text, headings) {
  const normalized = String(text || '').replace(/\s+/g, '')
  return headings.some(heading => normalized.includes(heading.replace(/\s+/g, '')))
}

function validateResumeInput(input) {
  if (!input?.targetLabel?.trim()) return '请先选择或填写简历目标方向。'
  if (!input?.experiences?.length && !input?.selectedExperiences?.length) return '请先准备经历资产。'
  return true
}

const STRATEGY_TREATMENTS = ['lead', 'include', 'deemphasize', 'exclude']
const STRATEGY_MODES = ['baseline', 'direction', 'jd']

function parseStructuredResult(text) {
  if (text && typeof text === 'object') return text
  return parseJsonFromMarkdown(text)
}

function getAllExperiences(input = {}) {
  return input.experiences?.length ? input.experiences : (input.selectedExperiences || [])
}

function validateDirections(result, experiences = []) {
  if (!result || !Array.isArray(result.directions)) return '方向推荐没有返回可识别的 directions。'
  if (result.directions.length < 3 || result.directions.length > 5) return '方向推荐必须包含3-5个方向。'
  if (!Array.isArray(result.capabilityProfile?.dominantCapabilities) || !result.capabilityProfile.dominantCapabilities.length) {
    return '方向推荐缺少基于经历事实提炼的能力画像。'
  }
  const validIds = new Set(experiences.map(item => item.id))
  const names = new Set()
  for (const direction of result.directions) {
    if (!direction?.id || !direction?.name || !['强', '中', '探索'].includes(direction.fit)) {
      return '方向推荐缺少名称、标识或正确的匹配度。'
    }
    if (names.has(direction.name.trim())) return `方向“${direction.name}”重复出现。`
    names.add(direction.name.trim())
    if (!Array.isArray(direction.evidenceExperienceIds) || !direction.evidenceExperienceIds.length) {
      return `方向“${direction.name}”缺少经历证据。`
    }
    if (direction.evidenceExperienceIds.some(id => !validIds.has(id))) {
      return `方向“${direction.name}”引用了不存在的经历。`
    }
    if (!['direct', 'adjacent'].includes(direction.pathType)) {
      return `方向“${direction.name}”缺少有效的路径类型。`
    }
    if (!Array.isArray(direction.evidence) || !direction.evidence.length) {
      return `方向“${direction.name}”缺少具体能力证据。`
    }
    for (const evidence of direction.evidence) {
      if (!validIds.has(evidence.experienceId)) return `方向“${direction.name}”的能力证据引用了不存在的经历。`
      if (!evidence.capability?.trim() || !evidence.proof?.trim() || evidence.proof.trim().length < 8) {
        return `方向“${direction.name}”的能力证据过于笼统。`
      }
    }
    if (!Array.isArray(direction.coreCompetencies) || direction.coreCompetencies.length < 2) {
      return `方向“${direction.name}”缺少足够的能力判断。`
    }
  }
  return true
}

export function validateResumeStrategy(strategy, experiences = []) {
  if (!strategy || typeof strategy !== 'object') return '选材策略不是可识别的结构。'
  if (!strategy.target?.label || !['recommended', 'custom', 'jd'].includes(strategy.target?.source)) {
    return '选材策略缺少有效的目标方向。'
  }
  if (!STRATEGY_MODES.includes(strategy.target?.mode)) return '选材策略缺少有效的版本模式。'
  if (!strategy.positioning?.trim()) return '选材策略缺少候选人定位。'
  if (!Array.isArray(strategy.experiencePlan)) return '选材策略缺少经历计划。'

  const experienceIds = experiences.map(item => item.id)
  const planIds = strategy.experiencePlan.map(item => item.experienceId)
  if (planIds.length !== experienceIds.length || new Set(planIds).size !== experienceIds.length) {
    return '选材策略必须逐一且只评估一次全部经历。'
  }
  if (experienceIds.some(id => !planIds.includes(id)) || planIds.some(id => !experienceIds.includes(id))) {
    return '选材策略包含未知经历，或遗漏了经历资产。'
  }

  const included = strategy.experiencePlan.filter(item => item.treatment !== 'exclude')
  if (!included.length) return '选材策略至少需要保留一条经历。'
  const orders = included.map(item => Number(item.order)).sort((a, b) => a - b)
  if (orders.some((order, index) => order !== index + 1)) return '保留经历的顺序必须从1开始连续排列。'

  for (const item of strategy.experiencePlan) {
    if (!STRATEGY_TREATMENTS.includes(item.treatment)) return `经历 ${item.experienceId} 的处理方式无效。`
    if (item.treatment === 'exclude') {
      if (Number(item.order) !== 0 || Number(item.bulletCount) !== 0) return '排除经历的顺序和 bullet 数必须为0。'
      continue
    }
    if (!item.angle?.trim() || !item.reason?.trim()) return `经历 ${item.experienceId} 缺少强调角度或选材原因。`
    const count = Number(item.bulletCount)
    if (!Number.isInteger(count) || count < 1 || count > 4) return `经历 ${item.experienceId} 的 bullet 数必须是1-4。`
  }
  return true
}

function strategyModeForInput(input = {}) {
  if (input.strategyMode && STRATEGY_MODES.includes(input.strategyMode)) return input.strategyMode
  if (input.jdText?.trim()) return 'jd'
  return input.targetLabel?.trim() === '通用实习简历' ? 'baseline' : 'direction'
}

function validateStrategyForInput(strategy, input) {
  const structural = validateResumeStrategy(strategy, getAllExperiences(input))
  if (structural !== true) return structural
  const expected = normalizeIdentity(input.targetLabel)
  const actual = normalizeIdentity(strategy.target?.label)
  if (expected && actual && !expected.includes(actual) && !actual.includes(expected)) {
    return '选材策略的目标方向与用户当前选择不一致。'
  }
  const expectedSource = input.targetSource || (input.jdText?.trim() ? 'jd' : 'custom')
  if (strategy.target?.source !== expectedSource) return '选材策略的目标来源与当前生成方式不一致。'
  const expectedMode = strategyModeForInput(input)
  if (strategy.target?.mode !== expectedMode) return '选材策略的版本模式与当前生成方式不一致。'
  return true
}

function strategyExperiences(strategy, experiences = []) {
  const byId = new Map(experiences.map(item => [item.id, item]))
  const typeOrder = { internship: 0, fulltime: 0, project: 1, campus: 2 }
  return [...(strategy?.experiencePlan || [])]
    .filter(item => item.treatment !== 'exclude')
    .map(item => byId.get(item.experienceId))
    .filter(Boolean)
    .sort((a, b) => {
      const typeDiff = (typeOrder[inferExperienceType(a)] ?? 9) - (typeOrder[inferExperienceType(b)] ?? 9)
      if (typeDiff !== 0) return typeDiff
      return resumeExperienceDateScore(b) - resumeExperienceDateScore(a)
    })
}

function normalizeStrategyExperienceOrder(strategy, experiences = []) {
  if (!strategy?.experiencePlan) return strategy
  const byId = new Map(experiences.map(item => [item.id, item]))
  const typeOrder = { internship: 0, fulltime: 0, project: 1, campus: 2 }
  const included = strategy.experiencePlan
    .filter(item => item.treatment !== 'exclude')
    .sort((a, b) => {
      const expA = byId.get(a.experienceId)
      const expB = byId.get(b.experienceId)
      const typeDiff = (typeOrder[inferExperienceType(expA)] ?? 9) - (typeOrder[inferExperienceType(expB)] ?? 9)
      if (typeDiff !== 0) return typeDiff
      return resumeExperienceDateScore(expB) - resumeExperienceDateScore(expA)
    })
    .map((item, index) => ({ ...item, order: index + 1 }))
  const excluded = strategy.experiencePlan
    .filter(item => item.treatment === 'exclude')
    .map(item => ({ ...item, order: 0, bulletCount: 0 }))
  return { ...strategy, experiencePlan: [...included, ...excluded] }
}

function buildStrategyContext(strategy) {
  return `【已确认选材策略】\n${JSON.stringify(strategy, null, 2)}`
}

async function collectStream(request) {
  let text = ''
  for await (const chunk of streamChat(request)) text += chunk
  return text
}

async function repairStructuredOutput({ raw, issue, system, userContext, settings }) {
  const repaired = await collectStream({
    ...settings,
    system,
    messages: [{
      role: 'user',
      content: [
        '上一次输出没有通过结构校验。请修复并重新输出完整JSON，不要解释。',
        `【校验问题】\n${issue}`,
        userContext,
        `【待修复输出】\n${typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}`,
      ].filter(Boolean).join('\n\n'),
    }],
  })
  return parseStructuredResult(repaired)
}

function buildSectionInstruction(sections = []) {
  const selected = (sections || []).filter(section => section.enabled)
  if (!selected.length) {
    return [
      '【简历模块与顺序】',
      '1. 教育背景',
      '2. 实习经历',
      '3. 项目经历',
      '4. 技能',
    ].join('\n')
  }

  return [
    '【简历模块与顺序】',
    '只输出以下被选择且有真实内容的模块，并严格按这个顺序输出。不要输出未选择模块，也不要输出空模块标题。',
    ...selected.map((section, index) => `${index + 1}. ${section.title}${section.optional ? '（如果没有真实素材，必须连标题一起跳过）' : ''}`),
  ].join('\n')
}

function sectionEnabled(input, id) {
  const sections = input?.resumeSections || []
  if (!sections.length) return true
  return !!sections.find(section => section.id === id && section.enabled)
}

function hasDisabledSectionHeading(text, input) {
  const headingMap = {
    summary: ['## 个人摘要', '## 个人介绍'],
    campus: ['## 校园经历', '## 校园实践', '## 校园活动'],
    awards: ['## 获奖成就', '## 获奖经历', '## 荣誉奖项', '## 证书奖项'],
    skills: ['## 技能', '## 技能与关键词', '## 专业技能'],
  }
  return Object.entries(headingMap).find(([id, headings]) => (
    !sectionEnabled(input, id) && hasAnyHeading(text, headings)
  ))
}

const SECTION_LABELS = {
  summary: '个人介绍',
  campus: '校园经历',
  awards: '获奖成就',
  skills: '技能',
}

function selectedSectionTitles(sections = []) {
  return (sections || [])
    .filter(section => section.enabled)
    .map(section => section.title)
}

function normalizeIdentity(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[*_#`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function experienceIdentityCandidates(experience = {}) {
  const primary = [
    experience.company,
    experience.title,
    String(experience.title || '').split(/[·｜|]/)[0],
    experience.projectName,
    experience.name,
  ]
    .map(normalizeIdentity)
    .filter(value => value.length >= 2)
  const companyAliases = String(experience.company || '')
    .split(/[-–—_|｜·]/)
    .slice(0, 1)
    .map(normalizeIdentity)
    .filter(value => value.length >= 3)
  return [...new Set([...primary, ...companyAliases])]
}

function parseResumeEntries(markdown = '') {
  const lines = String(markdown).split('\n')
  const entries = []
  let current = null
  lines.forEach((line, index) => {
    if (/^##\s+/.test(line.trim())) {
      if (current) entries.push(current)
      current = null
      return
    }
    if (/^###\s+/.test(line.trim())) {
      if (current) entries.push(current)
      current = { heading: line.replace(/^###\s+/, '').trim(), index, bullets: [], experienceId: '' }
      return
    }
    const markerId = line.match(/<!--\s*EXPERIENCE_ID\s*:\s*([^\s>]+)\s*-->/i)?.[1]
    if (current && markerId) {
      current.experienceId = markerId
      return
    }
    if (current && /^[-*]\s+/.test(line.trim())) current.bullets.push(line.trim())
  })
  if (current) entries.push(current)
  return entries
}

function findResumeEntry(entries, experience) {
  if (experience?.id) {
    const exact = entries.find(entry => entry.experienceId && String(entry.experienceId) === String(experience.id))
    if (exact) return exact
  }
  const candidates = experienceIdentityCandidates(experience)
  const company = normalizeIdentity(experience?.company)
  const role = normalizeIdentity(experience?.role)
  const time = normalizeIdentity(experience?.time)
  const title = normalizeIdentity(experience?.title)
  const ranked = entries.map(entry => {
    const heading = normalizeIdentity(entry.heading)
    let score = 0
    if (company.length >= 2 && (heading.includes(company) || company.includes(heading))) score += 60
    else if (candidates.some(candidate => heading.includes(candidate) || candidate.includes(heading))) score += 35
    if (role.length >= 3 && heading.includes(role)) score += 45
    if (time.length >= 4 && heading.includes(time)) score += 30
    if (title.length >= 4 && (heading.includes(title) || title.includes(heading))) score += 20
    return { entry, score }
  }).sort((a, b) => b.score - a.score)
  const bestScore = ranked[0]?.score || 0
  const secondScore = ranked[1]?.score || 0
  if (bestScore >= 45 && bestScore > secondScore) return ranked[0].entry

  if (role.length < 3) return null
  const roleMatches = entries.filter(entry => normalizeIdentity(entry.heading).includes(role))
  return roleMatches.length === 1 ? roleMatches[0] : null
}

function missingIncludedExperiences(text, input) {
  const entries = parseResumeEntries(text)
  const byId = new Map(getAllExperiences(input).map(item => [item.id, item]))
  return (input.confirmedStrategy?.experiencePlan || [])
    .filter(item => item.treatment !== 'exclude')
    .map(item => ({ item, experience: byId.get(item.experienceId) }))
    .filter(({ experience }) => experience && !findResumeEntry(entries, experience))
}

function canonicalExperienceHeading(experience = {}) {
  if (experience.company || experience.role || experience.time) {
    return [experience.company, experience.role, experience.time].filter(Boolean).join(' | ')
  }
  return experience.title || experience.projectName || experience.name || '未命名经历'
}

function experienceSectionTitle(experience = {}) {
  const type = inferExperienceType(experience)
  if (type === 'campus') return '校园经历'
  if (type === 'project') return '项目经历'
  return '实习经历'
}

function extractExperienceBlock(raw, experience, bulletCount) {
  const cleaned = String(raw || '')
    .replace(/^```(?:markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const lines = cleaned.split('\n')
  const start = lines.findIndex(line => /^###\s+/.test(line.trim()))
  const body = (start >= 0 ? lines.slice(start + 1) : lines)
    .filter(line => /^[-*]\s+\S+/.test(line.trim()))
    .slice(0, bulletCount)
    .map(line => `- ${line.trim().replace(/^[-*]\s+/, '')}`)
  const fallback = (experience.resume_bullets || experience.bullets || [])
    .slice(0, bulletCount)
    .map(line => `- ${String(line).replace(/^[-*•]\s*/, '').trim()}`)
  const bullets = body.length ? body : fallback
  if (!bullets.length) return ''
  const marker = experience.id ? `<!-- EXPERIENCE_ID:${experience.id} -->` : ''
  return [`### ${canonicalExperienceHeading(experience)}`, marker, ...bullets].filter(Boolean).join('\n')
}

function insertExperienceBlock(markdown, sectionTitle, block) {
  const lines = String(markdown || '').split('\n')
  const sectionIndex = lines.findIndex(line => normalizeIdentity(line.replace(/^##\s+/, '')) === normalizeIdentity(sectionTitle))
  if (sectionIndex < 0) {
    return [markdown.trim(), `## ${sectionTitle}`, block].filter(Boolean).join('\n\n')
  }
  let insertIndex = lines.length
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) {
      insertIndex = index
      break
    }
  }
  lines.splice(insertIndex, 0, '', block, '')
  return lines.join('\n')
}

async function restoreMissingExperiences(text, input, settings) {
  let result = text
  const missing = missingIncludedExperiences(result, input)
  for (const { item, experience } of missing) {
    const bulletCount = Math.max(1, Math.min(4, Number(item.bulletCount) || 2))
    const raw = await collectStream({
      ...settings,
      system: `你是一个严格的中文简历经历块写作助手。只输出一段经历，不要输出其他栏目、解释或代码块。

硬性规则：
- 这段经历是用户手动确认必须加入简历的内容，不得再次判断是否保留。
- 只能使用提供的经历资产，不能编造职责、数据、工具或结果。
- 第一行以 ### 开头，后续严格输出 ${bulletCount} 条以 - 开头的 bullet。
- 每条 bullet 要具体、克制，围绕指定强调角度表达。`,
      messages: [{
        role: 'user',
        content: [
          `【目标方向】\n${input.targetLabel || '通用简历'}`,
          `【强调角度】\n${item.angle || '保留这段经历中最有价值的行动和结果'}`,
          `【经历标题】\n${canonicalExperienceHeading(experience)}`,
          `【经历资产】\n${buildResumeExperienceContext([experience])}`,
        ].join('\n\n'),
      }],
    })
    const block = extractExperienceBlock(raw, experience, bulletCount)
    if (block) result = insertExperienceBlock(result, experienceSectionTitle(experience), block)
  }
  return result
}

function validateGeneratedResumeAgainstStrategy(text, input) {
  const experiences = getAllExperiences(input)
  const strategy = input.confirmedStrategy
  const strategyIssue = validateResumeStrategy(strategy, experiences)
  if (strategyIssue !== true) return strategyIssue

  const entries = parseResumeEntries(text)
  const byId = new Map(experiences.map(item => [item.id, item]))
  const includedPlan = [...strategy.experiencePlan].filter(item => item.treatment !== 'exclude')
  const excludedPlan = strategy.experiencePlan.filter(item => item.treatment === 'exclude')

  for (const item of includedPlan) {
    const experience = byId.get(item.experienceId)
    const entry = findResumeEntry(entries, experience)
    if (!entry) return `简历遗漏了策略要求使用的经历“${experience?.title || experience?.company || item.experienceId}”。`
  }

  for (const item of excludedPlan) {
    const experience = byId.get(item.experienceId)
    if (findResumeEntry(entries, experience)) {
      return `简历错误加入了策略已排除的经历“${experience?.title || experience?.company || item.experienceId}”。`
    }
  }

  const grouped = includedPlan.reduce((groups, item) => {
    const experience = byId.get(item.experienceId)
    const type = inferExperienceType(experience)
    if (!groups[type]) groups[type] = []
    groups[type].push({ item, experience })
    return groups
  }, {})
  for (const group of Object.values(grouped)) {
    group.sort((a, b) => resumeExperienceDateScore(b.experience) - resumeExperienceDateScore(a.experience))
    const positions = group.map(({ experience }) => findResumeEntry(entries, experience)?.index ?? -1)
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
      return '同一简历栏目内的经历没有按时间倒序排列。'
    }
  }
  return true
}

function enforceStrategyBulletLimits(markdown, input) {
  const experiences = getAllExperiences(input)
  const byId = new Map(experiences.map(item => [item.id, item]))
  const limits = (input.confirmedStrategy?.experiencePlan || [])
    .filter(item => item.treatment !== 'exclude')
    .map(item => ({
      experience: byId.get(item.experienceId),
      limit: Number(item.bulletCount),
    }))
    .filter(item => item.experience && Number.isInteger(item.limit) && item.limit > 0)

  let activeLimit = null
  let bulletCount = 0
  const output = []
  for (const line of String(markdown || '').split('\n')) {
    if (/^##\s+/.test(line.trim())) {
      activeLimit = null
      bulletCount = 0
      output.push(line)
      continue
    }
    const markerId = line.match(/<!--\s*EXPERIENCE_ID\s*:\s*([^\s>]+)\s*-->/i)?.[1]
    if (markerId) {
      const matched = limits.find(({ experience }) => String(experience.id) === markerId)
      if (matched) activeLimit = matched.limit
      output.push(line)
      continue
    }
    if (/^###\s+/.test(line.trim())) {
      const heading = normalizeIdentity(line.replace(/^###\s+/, ''))
      const matched = limits.find(({ experience }) => (
        experienceIdentityCandidates(experience).some(candidate => (
          heading.includes(candidate) || candidate.includes(heading)
        ))
      ))
      activeLimit = matched?.limit || null
      bulletCount = 0
      output.push(line)
      continue
    }
    if (activeLimit && /^[-*]\s+/.test(line.trim())) {
      bulletCount += 1
      if (bulletCount > activeLimit) continue
    }
    output.push(line)
  }
  return output.join('\n')
}

function finalizeGeneratedResume(text, input) {
  const experiences = getAllExperiences(input)
  const normalizedHeadings = normalizeResumeHeadingLevels(text)
  const placed = normalizeResumeExperiencePlacement(removeEmptyResumeSections(normalizedHeadings))
  const deduped = dedupeResumeExperienceEntries(placed, experiences)
  const chronological = normalizeResumeChronology(deduped, experiences)
  return removeEmptyResumeSections(enforceStrategyBulletLimits(chronological, input))
}

async function repairResumeWithAi(text, input, settings) {
  const selectedExperiences = strategyExperiences(input.confirmedStrategy, getAllExperiences(input))
  const titles = selectedSectionTitles(input.resumeSections)
  const moduleList = titles.length ? titles : ['教育背景', '实习经历', '项目经历', '技能']
  const system = `你是一个严格的中文简历结构质检与修复助手。

你的任务不是重新发挥，而是检查并修复一份已经生成的简历正文，使它严格符合用户选择的模块结构。

判断规则：
- 只输出修复后的完整 Markdown 简历正文，不要解释，不要输出 JSON。
- 不要输出姓名、手机号、邮箱、城市、照片、作品集链接等页眉信息。
- 不要输出“简历版本”“这版简历的使用建议”“使用建议”“适合投递岗位”“修改建议”等非简历正文内容。
- 不要输出 ---、***、___ 等 Markdown 分隔线。
- 必须严格按用户选择的模块顺序输出，未选择模块不要输出。
- 必须严格执行【已确认选材策略】中的经历取舍、强调角度和 bullet 数量。
- 简历框架不随方向变化；所有经历必须放入固定一级栏目，并在每个栏目内按开始时间倒序排列，最近的经历在最前。
- treatment 为 exclude 的经历绝对不能出现，其他经历不能遗漏。
- 每段经历标题下一行必须保留对应的 <!-- EXPERIENCE_ID:真实经历ID -->，ID只能来自经历资产，不能改写或编造。
- 必须严格按【经历一级归属清单】放置经历；公司实习里的项目/系统/模型/工具是该实习内部工作内容，不等于简历一级栏目“项目经历”。
- “实习经历”只放公司实习、正式工作、组织内岗位经历。
- “项目经历”只放个人项目、课程项目、创业项目、作品、AI应用、小程序、品牌项目等非正式实习经历。
- “校园经历”只放社团、学生组织、竞赛、志愿、校园活动等。
- “获奖成就”只放奖项、证书、语言成绩、竞赛结果等。
- 如果某个模块没有真实素材，必须跳过整个模块标题，不要输出“暂无/无/待补充”占位。
- 小节标题必须使用用户选择的模块名称，例如 ## 教育背景、## 实习经历。
- 教育背景中每所学校的学校、专业、学历、时间和 GPA/绩点必须合并在同一行。
- 每段经历保留事实，不要编造数据。`

  const user = [
    '【用户选择的模块与顺序】',
    moduleList.map((title, index) => `${index + 1}. ${title}`).join('\n'),
    '',
    '【目标】',
    input.targetLabel || '',
    '',
    input.searchContext?.trim() || '【公开信息补充】\n未使用公开信息。',
    '',
    '【基础信息摘要】',
    buildProfileContext(input.profile),
    '',
    '【原简历结构快照】',
    buildOriginalResumeContext(input.originalResume),
    '',
    buildResumeModulePlan(selectedExperiences),
    '',
    buildStrategyContext(input.confirmedStrategy),
    '',
    '【经历素材】',
    buildResumeExperienceContext(selectedExperiences),
    '',
    '【待修复简历正文】',
    text,
  ].join('\n')

  const gen = streamChat({
    ...settings,
    system,
    messages: [{ role: 'user', content: user }],
  })

  let repaired = ''
  for await (const chunk of gen) repaired += chunk
  return finalizeGeneratedResume(repaired.trim() || text, input)
}

function validateResumeResult(text, input) {
  if (!hasMinimumText(text, 300)) return '简历生成内容过短，请重试。'
  if (/这版简历的使用建议|使用建议|适合投递|针对JD优化建议|修改建议/.test(text)) {
    return 'AI 把建议内容写进了简历正文，请重试。'
  }
  if (text.includes('# 简历版本')) return 'AI 输出了不该出现的简历版本标题，请重试。'
  if (hasAnyHeading(text, ['## 实习 / 项目经历', '## 实习/项目经历', '## 实习经历 / 项目经历'])) {
    return 'AI 把实习经历和项目经历合并了，请重试。'
  }
  const disabledSection = hasDisabledSectionHeading(text, input)
  if (disabledSection) {
    return `AI 输出了未选择的${SECTION_LABELS[disabledSection[0]] || disabledSection[0]}模块，请重试。`
  }
  const hasEducation = hasAnyHeading(text, ['## 教育背景', '## 教育经历'])
  const hasExperience = hasAnyHeading(text, [
    '## 实习经历',
    '## 项目经历',
    '## 工作经历',
  ])
  if (!hasEducation && !hasExperience) return 'AI 没有按简历结构输出，请重试。'
  if (text.includes('```json')) return 'AI 输出了不该出现的 JSON，请重试。'
  return validateGeneratedResumeAgainstStrategy(text, input)
}

export const resumeDirectionRecommendationSkill = defineTextSkill({
  id: 'resume.direction.recommend',
  name: '简历方向推荐',
  description: '读取全部经历资产，推荐3-5个有证据支撑的简历方向。',
  version: '0.2.0',
  outputType: 'json',
  validateInput: input => getAllExperiences(input).length ? true : '请先准备经历资产。',
  buildSystemPrompt: () => getResumeDirectionRecommendationSystem(),
  buildUserMessage: input => [
    '请先从事实中提炼能力画像，再根据能力与工作方式的匹配推荐简历方向。不要先看岗位名称下结论。',
    '【全部经历的能力证据】\n' + buildResumeDirectionEvidenceContext(getAllExperiences(input)),
  ].join('\n\n'),
  parseResult: text => parseStructuredResult(text),
  repairResult: async (result, raw, input, settings) => {
    const experiences = getAllExperiences(input)
    const issue = validateDirections(result, experiences)
    if (issue === true) return result
    return repairStructuredOutput({
      raw,
      issue,
      system: getResumeDirectionRecommendationSystem(),
      userContext: '【全部经历的能力证据】\n' + buildResumeDirectionEvidenceContext(experiences),
      settings,
    })
  },
  validateResult: (result, _raw, input) => validateDirections(result, getAllExperiences(input)),
})

export const resumeStrategySkill = defineTextSkill({
  id: 'resume.strategy.analyze',
  name: '方向化简历选材',
  description: '读取全部经历，为一个目标方向/JD制定可确认的结构化选材策略。',
  version: '0.3.0',
  outputType: 'json',
  validateInput: validateResumeInput,
  buildSystemPrompt: () => getResumeFitAnalysisSystem(),
  buildUserMessage: input => [
    ...baseInput({ ...input, noJdText: '用户没有提供具体JD，请基于目标方向做通用简历定位。' }),
    `【目标来源】\n${input.targetSource || (input.jdText?.trim() ? 'jd' : 'custom')}`,
    `【策略模式】\n${strategyModeForInput(input)}`,
    buildResumeModulePlan(getAllExperiences(input)),
    '【全部经历资产】\n' + buildResumeExperienceContext(getAllExperiences(input)),
  ].join('\n\n'),
  parseResult: (text, input) => normalizeStrategyExperienceOrder(parseStructuredResult(text), getAllExperiences(input)),
  repairResult: async (result, raw, input, settings) => {
    const experiences = getAllExperiences(input)
    const issue = validateStrategyForInput(result, input)
    if (issue === true) return result
    const repaired = await repairStructuredOutput({
      raw,
      issue,
      system: getResumeFitAnalysisSystem(),
      userContext: [
        `【目标方向】\n${input.targetLabel}`,
        `【目标来源】\n${input.targetSource || (input.jdText?.trim() ? 'jd' : 'custom')}`,
        `【策略模式】\n${strategyModeForInput(input)}`,
        '【全部经历资产】\n' + buildResumeExperienceContext(experiences),
      ].join('\n\n'),
      settings,
    })
    return normalizeStrategyExperienceOrder(repaired, experiences)
  },
  validateResult: (result, _raw, input) => validateStrategyForInput(result, input),
})

export const resumeStrategyRefineSkill = defineTextSkill({
  id: 'resume.strategy.refine',
  name: '简历定位优化',
  description: '按用户偏好优化当前简历定位，不生成完整简历。',
  version: '0.2.0',
  outputType: 'json',
  validateInput: input => {
    const base = validateResumeInput(input)
    if (base !== true) return base
    if (!input?.resumeStrategy) return '请先生成选材策略。'
    if (!input?.strategyInstruction?.trim()) return '请先填写优化要求。'
    return true
  },
  buildSystemPrompt: () => getResumeStrategyRefineSystem(),
  buildUserMessage: input => [
    '【优化要求】\n' + input.strategyInstruction.trim(),
    ...baseInput(input),
    `【策略模式】\n${strategyModeForInput(input)}`,
    buildResumeModulePlan(getAllExperiences(input)),
    '【全部经历资产】\n' + buildResumeExperienceContext(getAllExperiences(input)),
    '【当前选材策略】\n' + JSON.stringify(input.resumeStrategy, null, 2),
  ].join('\n\n'),
  parseResult: (text, input) => normalizeStrategyExperienceOrder(parseStructuredResult(text), getAllExperiences(input)),
  repairResult: async (result, raw, input, settings) => {
    const experiences = getAllExperiences(input)
    const issue = validateStrategyForInput(result, input)
    if (issue === true) return result
    const repaired = await repairStructuredOutput({
      raw,
      issue,
      system: getResumeStrategyRefineSystem(),
      userContext: [
        `【优化要求】\n${input.strategyInstruction}`,
        `【策略模式】\n${strategyModeForInput(input)}`,
        '【全部经历资产】\n' + buildResumeExperienceContext(experiences),
        '【当前策略】\n' + JSON.stringify(input.resumeStrategy, null, 2),
      ].join('\n\n'),
      settings,
    })
    return normalizeStrategyExperienceOrder(repaired, experiences)
  },
  validateResult: (result, _raw, input) => validateStrategyForInput(result, input),
})

export const resumeGenerateSkill = defineTextSkill({
  id: 'resume.generate',
  name: '简历版本生成',
  description: '严格执行用户已确认的方向化选材策略，生成完整 Markdown 简历。',
  version: '0.3.0',
  validateInput: input => {
    const base = validateResumeInput(input)
    if (base !== true) return base
    if (!input?.confirmedStrategy) return '请先生成并确认选材策略。'
    return validateStrategyForInput(input.confirmedStrategy, input)
  },
  buildSystemPrompt: () => getResumeVersionSystem(),
  buildUserMessage: input => {
    const selectedExperiences = strategyExperiences(input.confirmedStrategy, getAllExperiences(input))
    const userOverrides = (input.confirmedStrategy?.experiencePlan || [])
      .filter(item => item.userOverride === 'include' && item.treatment !== 'exclude')
      .map(item => {
        const experience = getAllExperiences(input).find(exp => exp.id === item.experienceId)
        return `- ${canonicalExperienceHeading(experience)}：必须保留，${item.bulletCount} 条 bullet`
      })
    return [
      input.task ? '【任务】\n' + input.task : null,
      ...baseInput({ ...input, noJdText: '用户没有提供具体JD，请生成目标方向通用版。' }),
      userOverrides.length
        ? `【用户手动指定的硬约束】\n以下经历由用户亲自加入，优先级高于 AI 的方向推荐和篇幅取舍，绝对不能省略：\n${userOverrides.join('\n')}`
        : null,
      buildStrategyContext(input.confirmedStrategy),
      buildSectionInstruction(input.resumeSections),
      buildResumeModulePlan(selectedExperiences),
      '【原简历结构快照】\n' + buildOriginalResumeContext(input.originalResume),
      '【策略允许使用的经历资产】\n' + buildResumeExperienceContext(selectedExperiences),
      input.currentResume ? '【当前简历】\n' + input.currentResume : null,
      input.resumeReview ? '【体检报告】\n' + input.resumeReview : null,
    ].filter(Boolean).join('\n\n')
  },
  repairResult: async (text, _full, input, settings) => {
    const normalized = finalizeGeneratedResume(text, input)
    const issue = validateResumeResult(normalized, input)
    if (issue === true) return normalized
    let repaired = finalizeGeneratedResume(await repairResumeWithAi(normalized, input, settings), input)
    if (missingIncludedExperiences(repaired, input).length) {
      repaired = finalizeGeneratedResume(await restoreMissingExperiences(repaired, input, settings), input)
    }
    return repaired
  },
  validateResult: (text, _full, input) => validateResumeResult(text, input),
})

export const resumeLocalRewriteSkill = defineTextSkill({
  id: 'resume.local.rewrite',
  name: '简历局部优化',
  description: '只优化简历中的一段经历或一条 bullet，并保留其他内容。',
  version: '0.1.0',
  validateInput: input => {
    if (!['entry', 'bullet'].includes(input?.type)) return '请选择要优化的经历或 bullet。'
    if (!input?.content?.trim()) return '当前内容为空，无法优化。'
    if (!input?.instruction?.trim()) return '请填写优化要求。'
    if (!input?.sourceExperience) return '没有找到这段内容对应的经历资产。'
    return true
  },
  buildSystemPrompt: input => `你是一个严格的中文简历局部编辑器。

你只重写用户指定的${input.type === 'entry' ? '一段经历' : '一条 bullet'}，不得输出简历其他部分。

硬性规则：
- 事实只能来自【对应经历资产】和【当前内容】，不能编造职责、项目、数据、结果或工具。
- 目标方向和 JD 只能影响表达重点，不能改变事实。
- 不要解释修改过程，不要输出代码块、引号、标题说明或“优化后”等前缀。
- 不要输出 ---、***、___ 等分隔线。
${input.type === 'entry'
    ? '- 必须输出完整经历块：第一行以 ### 开头并原样保留当前经历标题；如果原文含 EXPERIENCE_ID 注释，必须原样保留在标题下一行；后续每条以 - 开头。默认保持原 bullet 数量，除非用户明确要求增减。'
    : '- 只输出一条 bullet 的纯文字，不要带项目符号、序号或换行。'}
- 语言具体、克制、有动作和结果，避免空泛评价。`,
  buildUserMessage: input => [
    `【优化要求】\n${input.instruction.trim()}`,
    `【目标方向】\n${input.targetLabel || '通用简历'}`,
    input.jdText?.trim() ? `【目标 JD】\n${input.jdText.trim()}` : null,
    `【对应经历资产】\n${JSON.stringify(input.sourceExperience, null, 2)}`,
    `【当前${input.type === 'entry' ? '经历块' : 'bullet'}】\n${input.content.trim()}`,
  ].filter(Boolean).join('\n\n'),
  parseResult: (text, input) => {
    let result = String(text || '').trim()
      .replace(/^```(?:markdown)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/^(?:优化后|修改后|结果)[：:]\s*/i, '')
      .trim()
    if (input.type === 'bullet') {
      result = result.split('\n').find(line => line.trim())?.replace(/^[-*•\d.)、\s]+/, '').trim() || ''
    } else {
      const originalTitle = input.content.split('\n').find(line => /^###\s+/.test(line.trim()))?.trim()
      const originalMarker = input.content.split('\n').find(line => /<!--\s*EXPERIENCE_ID\s*:/i.test(line))?.trim()
      const lines = result.split('\n').filter(line => !/<!--\s*EXPERIENCE_ID\s*:/i.test(line))
      if (originalTitle) {
        if (/^###\s+/.test(lines[0]?.trim())) lines[0] = originalTitle
        else lines.unshift(originalTitle)
        if (originalMarker) lines.splice(1, 0, originalMarker)
        result = lines.join('\n').trim()
      }
    }
    return result
  },
  validateResult: (text, _raw, input) => {
    if (!text?.trim()) return '局部优化没有返回内容。'
    if (/```|^##\s/m.test(text)) return '局部优化返回了不需要的结构。'
    if (input.type === 'bullet') {
      if (text.includes('\n')) return '单条 bullet 优化结果包含多行内容。'
      if (text.length < 12) return '单条 bullet 优化结果过短。'
      return true
    }
    if (!/^###\s+\S+/m.test(text)) return '经历优化结果缺少经历标题。'
    if (!/^[-*]\s+\S+/m.test(text)) return '经历优化结果缺少 bullet。'
    return true
  },
})

export const resumeReviewSkill = defineTextSkill({
  id: 'resume.review',
  name: '成品简历体检',
  description: '检查生成后的简历是否可投递，并指出具体修改优先级。',
  version: '0.1.0',
  validateInput: input => {
    const base = validateResumeInput(input)
    if (base !== true) return base
    if (!input?.outputText?.trim()) return '请先生成或打开一版简历。'
    if (!input?.confirmedStrategy) return '当前简历缺少已确认选材策略。'
    return validateStrategyForInput(input.confirmedStrategy, input)
  },
  buildSystemPrompt: () => getResumeReviewSystem(),
  buildUserMessage: input => {
    const selectedExperiences = strategyExperiences(input.confirmedStrategy, getAllExperiences(input))
    return [
      ...baseInput(input),
      buildStrategyContext(input.confirmedStrategy),
      buildResumeModulePlan(selectedExperiences),
      '【经历素材】\n' + buildResumeExperienceContext(selectedExperiences),
      '【待体检简历】\n' + input.outputText,
    ].join('\n\n')
  },
  validateResult: text => {
    if (!hasUsefulMarkdown(text)) return '简历体检内容过短，请重试。'
    if (!text.includes('## 总体判断')) return '简历体检缺少总体判断，请重试。'
    if (!text.includes('## 修改优先级')) return '简历体检缺少修改优先级，请重试。'
    return true
  },
})
