const PROJECT_RE = /项目|作品|小程序|系统|平台|工具|应用|app|网站|demo|rag|agent|prompt|模型|算法|品牌|创业|课程设计|课设|毕设|产品设计|案例库|云函数|向量|embedding/i
const CAMPUS_RE = /校园|学生会|社团|协会|志愿|义工|班委|团委|校级|院级|社长|部长|干事|支教|迎新|校园活动/i
const INTERNSHIP_RE = /实习|intern|实习生|公司|有限公司|集团|科技|字节|腾讯|阿里|美团|百度|京东|shopee|tiktok|cider|product/i
const COMPANY_EXPERIENCE_RE = /特赞|cider|shopee|字节|tiktok|腾讯|阿里|美团|百度|京东|公司|有限公司|集团|科技|实习|intern|产品经理|产品运营|商业产品运营|seller\s*产品/i

function joinedExperienceText(exp = {}) {
  return [
    exp.title,
    exp.company,
    exp.role,
    exp.time,
    ...(exp.bullets || exp.resume_bullets || []),
  ].filter(Boolean).join(' ')
}

export function inferExperienceType(exp = {}) {
  const current = String(exp.type || '').toLowerCase()
  const text = joinedExperienceText(exp)
  const looksLikeCompanyExperience = COMPANY_EXPERIENCE_RE.test(text) && !/小程序|个人项目|课程项目|创业|品牌|作品|demo/i.test(text)

  if (exp.typeConfirmed && ['project', 'internship', 'fulltime', 'campus'].includes(current)) return current
  if (current === 'internship' || current === 'fulltime') return current
  if (looksLikeCompanyExperience) return 'internship'
  if (current === 'project') return current
  if (current === 'campus') {
    if (PROJECT_RE.test(text) && !CAMPUS_RE.test(text)) return 'project'
    return 'campus'
  }
  if (INTERNSHIP_RE.test(text)) return 'internship'
  if (CAMPUS_RE.test(text) && !PROJECT_RE.test(text)) return 'campus'
  if (PROJECT_RE.test(text) && !CAMPUS_RE.test(text)) return 'project'
  return current || 'project'
}

export function inferSourceSectionCategory(section = {}) {
  const title = String(section.title || '')
  const content = String(section.content || '')
  const text = `${title}\n${content}`
  if (/教育|学历|学校|education/i.test(title)) return 'education'
  if (/实习|工作经历|工作经验|professional|experience/i.test(title)) return 'internship'
  if (/项目|作品|创业|个人项目|课程项目|project/i.test(title)) return 'project'
  if (/校园|学生工作|社团|志愿|campus|student/i.test(title)) return 'campus'
  if (/获奖|荣誉|证书|奖项|certificate|award/i.test(title)) return 'awards'
  if (/技能|关键词|skill/i.test(title)) return 'skills'
  if (/个人|摘要|summary|profile/i.test(title)) return 'summary'
  if (PROJECT_RE.test(text) && !CAMPUS_RE.test(title)) return 'project'
  if (CAMPUS_RE.test(text) && !PROJECT_RE.test(text)) return 'campus'
  return section.category || 'other'
}

export function normalizeParsedResumeResult(result) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    sourceSections: Array.isArray(result.sourceSections)
      ? result.sourceSections.map(section => ({
        ...section,
        category: inferSourceSectionCategory(section),
      }))
      : [],
    experiences: Array.isArray(result.experiences)
      ? result.experiences.map(exp => ({
        ...exp,
        bullets: Array.isArray(exp.bullets) ? exp.bullets : [],
        type: inferExperienceType(exp),
      }))
      : [],
  }
}

function stripSectionText(text = '') {
  return String(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*•]\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\[[^\]]*待补充[^\]]*\]/g, '')
    .replace(/[：:；;，,。.、\s|｜\-_/\\]+/g, '')
    .trim()
}

function isEmptyResumeSection(lines) {
  const raw = lines.join('\n').trim()
  if (!raw) return true
  const meaningful = stripSectionText(raw)
  if (!meaningful) return true
  if (/^(暂无|无|没有|不适用|待补充|无相关|无素材|略|none|na|n\/a)+$/i.test(meaningful)) return true
  const nonBlank = raw.split('\n').map(line => line.trim()).filter(Boolean)
  return nonBlank.every(line => {
    const text = stripSectionText(line)
    return !text || /^(暂无|无|没有|不适用|待补充|无相关|无素材|略|none|na|n\/a)+$/i.test(text)
  })
}

function compactEducationMetadata(lines) {
  const output = []
  let inEducationSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^##\s+/.test(trimmed)) {
      inEducationSection = /^##\s*(?:教育背景|教育经历)/.test(trimmed)
      output.push(line)
      continue
    }

    if (inEducationSection && /^(?:[-*•]\s*)?(?:\*\*)?(?:GPA|绩点)(?:\*\*)?\s*[:：]?\s*\S+/i.test(trimmed)) {
      let previousIndex = output.length - 1
      while (previousIndex >= 0 && !output[previousIndex].trim()) previousIndex -= 1
      if (previousIndex >= 0 && /^###\s+/.test(output[previousIndex].trim())) {
        const metadata = trimmed.replace(/^[-*•]\s*/, '')
        output[previousIndex] = `${output[previousIndex].trimEnd()} | ${metadata}`
        continue
      }
    }

    output.push(line)
  }

  return output
}

export function removeEmptyResumeSections(markdown = '') {
  const lines = compactEducationMetadata(
    String(markdown || '')
      .split('\n')
      .filter(line => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
  )
  const output = []
  let currentHeading = null
  let currentLines = []

  const flush = () => {
    if (!currentHeading) return
    if (!isEmptyResumeSection(currentLines)) {
      while (output.length && output[output.length - 1].trim() === '') output.pop()
      output.push('', currentHeading, ...currentLines)
    }
  }

  for (const line of lines) {
    if (/^##\s+/.test(line.trim())) {
      flush()
      currentHeading = line
      currentLines = []
      continue
    }
    if (currentHeading) {
      currentLines.push(line)
    } else {
      output.push(line)
    }
  }
  flush()
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function splitResumeSections(markdown = '') {
  const sections = []
  let current = null
  for (const line of String(markdown || '').split('\n')) {
    if (/^##\s+/.test(line.trim())) {
      if (current) sections.push(current)
      current = { heading: line, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
    else {
      if (!sections[0]?.preamble) sections.unshift({ heading: '', lines: [], preamble: true })
      sections[0].lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
}

function splitExperienceEntries(lines = []) {
  const before = []
  const entries = []
  let current = null
  for (const line of lines) {
    if (/^###\s+/.test(line.trim())) {
      if (current) entries.push(current)
      current = [line]
      continue
    }
    if (current) current.push(line)
    else before.push(line)
  }
  if (current) entries.push(current)
  return { before, entries }
}

function isInternshipResumeEntry(entryLines = []) {
  const text = entryLines.join('\n')
  const title = entryLines[0] || ''
  if (/实习|intern/i.test(title)) return true
  if (/特赞|cider|shopee|字节|tiktok|global monetization/i.test(title)) return true
  if (/公司|有限公司|集团|科技/.test(title) && /产品经理|产品运营|运营|分析|BD/i.test(title)) return true
  if (/推荐产品经理|AI\s*产品经理|商业产品运营|Seller\s*产品经理/i.test(title)) return true
  if (/购买力|周期性特征|精排|广告模型|推荐策略/i.test(text) && /Cider|推荐产品经理/i.test(text)) return true
  return false
}

function isProjectResumeEntry(entryLines = []) {
  const title = entryLines[0] || ''
  if (isInternshipResumeEntry(entryLines)) return false
  return /小程序|文创品牌|创业|创始人|个人项目|课程项目|项目经历|产品设计|RAG|Agent|作品/i.test(title)
}

function compactSectionLines(before, entries) {
  return [
    ...before.filter(line => line.trim()),
    ...entries.flatMap(entry => ['', ...entry]),
  ].join('\n').split('\n')
}

function normalizeEntryIdentity(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[*_#`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function experienceIdentityCandidates(exp = {}) {
  const primary = [
    exp.company,
    exp.title,
    String(exp.title || '').split(/[·｜|]/)[0],
    exp.projectName,
    exp.name,
  ]
    .map(normalizeEntryIdentity)
    .filter(value => value.length >= 2)
  const aliases = String(exp.company || '')
    .split(/[-–—_|｜·]/)
    .slice(0, 1)
    .map(normalizeEntryIdentity)
    .filter(value => value.length >= 3)
  return [...new Set([...primary, ...aliases])]
}

function findExperienceForEntry(entry = [], experiences = []) {
  const markerId = entry
    .map(line => line.match(/<!--\s*EXPERIENCE_ID\s*:\s*([^\s>]+)\s*-->/i)?.[1])
    .find(Boolean)
  if (markerId) {
    const exact = experiences.find(experience => String(experience.id) === markerId)
    if (exact) return exact
  }
  const heading = normalizeEntryIdentity(String(entry[0] || '').replace(/^###\s+/, ''))
  const ranked = experiences.map(experience => {
    const company = normalizeEntryIdentity(experience.company)
    const role = normalizeEntryIdentity(experience.role)
    const time = normalizeEntryIdentity(experience.time)
    const title = normalizeEntryIdentity(experience.title)
    const aliases = experienceIdentityCandidates(experience)
    let score = 0
    if (company.length >= 2 && (heading.includes(company) || company.includes(heading))) score += 60
    else if (aliases.some(alias => heading.includes(alias) || alias.includes(heading))) score += 35
    if (role.length >= 3 && heading.includes(role)) score += 45
    if (time.length >= 4 && heading.includes(time)) score += 30
    if (title.length >= 4 && (heading.includes(title) || title.includes(heading))) score += 20
    return { experience, score }
  }).sort((a, b) => b.score - a.score)
  const bestScore = ranked[0]?.score || 0
  const secondScore = ranked[1]?.score || 0
  if (bestScore >= 45 && bestScore > secondScore) return ranked[0].experience

  const roleMatches = experiences.filter(experience => {
    const role = normalizeEntryIdentity(experience.role)
    return role.length >= 3 && heading.includes(role)
  })
  return roleMatches.length === 1 ? roleMatches[0] : null
}

export function normalizeResumeHeadingLevels(markdown = '') {
  return String(markdown || '').replace(/^#{3,6}\s+/gm, '### ')
}

export function ensureResumeExperienceIds(markdown = '', experiences = []) {
  if (!experiences.length) return markdown
  const sections = splitResumeSections(normalizeResumeHeadingLevels(markdown))
  const experienceSectionRe = /^##\s*(?:实习经历|工作经历|项目经历|校园经历|校园实践|校园活动)/

  sections.forEach(section => {
    if (!experienceSectionRe.test(section.heading.trim())) return
    const split = splitExperienceEntries(section.lines)
    const entries = split.entries.map(entry => {
      if (entry.some(line => /<!--\s*EXPERIENCE_ID\s*:/i.test(line))) return entry
      const experience = findExperienceForEntry(entry, experiences)
      if (!experience?.id) return entry
      return [entry[0], `<!-- EXPERIENCE_ID:${experience.id} -->`, ...entry.slice(1)]
    })
    section.lines = compactSectionLines(split.before, entries)
  })

  return removeEmptyResumeSections(sections.map(section => (
    section.preamble
      ? section.lines.join('\n')
      : [section.heading, ...section.lines].join('\n')
  )).join('\n'))
}

export function dedupeResumeExperienceEntries(markdown = '', experiences = []) {
  const sections = splitResumeSections(ensureResumeExperienceIds(markdown, experiences))
  const experienceSectionRe = /^##\s*(?:实习经历|工作经历|项目经历|校园经历|校园实践|校园活动)/

  sections.forEach(section => {
    if (!experienceSectionRe.test(section.heading.trim())) return
    const split = splitExperienceEntries(section.lines)
    const byKey = new Map()

    split.entries.forEach((entry, originalIndex) => {
      const experience = findExperienceForEntry(entry, experiences)
      const key = experience?.id
        ? `experience:${experience.id}`
        : `heading:${normalizeEntryIdentity(entry[0])}`
      const bulletCount = entry.filter(line => /^[-*]\s+\S+/.test(line.trim())).length
      const score = bulletCount * 10000 + entry.join('\n').length
      const previous = byKey.get(key)
      if (!previous || score > previous.score) {
        byKey.set(key, { entry, originalIndex: previous?.originalIndex ?? originalIndex, score })
      }
    })

    const entries = [...byKey.values()]
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map(item => item.entry)
    section.lines = compactSectionLines(split.before, entries)
  })

  return removeEmptyResumeSections(sections.map(section => (
    section.preamble
      ? section.lines.join('\n')
      : [section.heading, ...section.lines].join('\n')
  )).join('\n'))
}

export function resumeExperienceDateScore(experience = {}) {
  const source = [experience.time, experience.title].filter(Boolean).join(' ')
  const match = source.match(/((?:19|20)\d{2})\D{0,4}(\d{1,2})?/)
  if (!match) return 0
  return Number(match[1]) * 100 + Number(match[2] || 1)
}

export function normalizeResumeChronology(markdown = '', experiences = []) {
  if (!experiences.length) return markdown
  const sections = splitResumeSections(markdown)
  const experienceSectionRe = /^##\s*(?:实习经历|工作经历|项目经历|校园经历|校园实践|校园活动)/

  sections.forEach(section => {
    if (!experienceSectionRe.test(section.heading.trim())) return
    const split = splitExperienceEntries(section.lines)
    const decorated = split.entries.map((entry, originalIndex) => {
      const experience = findExperienceForEntry(entry, experiences)
      return {
        entry,
        originalIndex,
        matched: !!experience,
        score: resumeExperienceDateScore(experience),
      }
    })
    decorated.sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      if (a.score !== b.score) return b.score - a.score
      return a.originalIndex - b.originalIndex
    })
    section.lines = compactSectionLines(split.before, decorated.map(item => item.entry))
  })

  return removeEmptyResumeSections(sections.map(section => (
    section.preamble
      ? section.lines.join('\n')
      : [section.heading, ...section.lines].join('\n')
  )).join('\n'))
}

export function normalizeResumeExperiencePlacement(markdown = '') {
  const sections = splitResumeSections(markdown)
  let internshipSection = sections.find(section => /^##\s*实习经历/.test(section.heading.trim()))
  let projectSection = sections.find(section => /^##\s*项目经历/.test(section.heading.trim()))
  if (!internshipSection && !projectSection) return markdown

  const internshipSplit = splitExperienceEntries(internshipSection?.lines || [])
  const projectSplit = splitExperienceEntries(projectSection?.lines || [])
  const allEntries = [
    ...internshipSplit.entries.map(entry => ({ entry, source: 'internship' })),
    ...projectSplit.entries.map(entry => ({ entry, source: 'project' })),
  ]

  const internshipEntries = []
  const projectEntries = []
  allEntries.forEach(({ entry, source }) => {
    if (isInternshipResumeEntry(entry)) internshipEntries.push(entry)
    else if (source === 'project' || isProjectResumeEntry(entry)) projectEntries.push(entry)
    else internshipEntries.push(entry)
  })

  if (internshipEntries.length && !internshipSection) {
    internshipSection = { heading: '## 实习经历', lines: [] }
    const projectIndex = sections.indexOf(projectSection)
    const fallbackIndex = sections.findIndex(section => /^##\s*(?:校园|获奖|荣誉|技能)/.test(section.heading.trim()))
    const insertIndex = projectIndex >= 0 ? projectIndex : fallbackIndex >= 0 ? fallbackIndex : sections.length
    sections.splice(insertIndex, 0, internshipSection)
  }
  if (projectEntries.length && !projectSection) {
    projectSection = { heading: '## 项目经历', lines: [] }
    const fallbackIndex = sections.findIndex(section => /^##\s*(?:校园|获奖|荣誉|技能)/.test(section.heading.trim()))
    const internshipIndex = sections.indexOf(internshipSection)
    const insertIndex = fallbackIndex >= 0
      ? fallbackIndex
      : internshipIndex >= 0
        ? internshipIndex + 1
        : sections.length
    sections.splice(insertIndex, 0, projectSection)
  }

  if (internshipSection) internshipSection.lines = compactSectionLines(internshipSplit.before, internshipEntries)
  if (projectSection) projectSection.lines = compactSectionLines(projectSplit.before, projectEntries)

  return removeEmptyResumeSections(sections.map(section => (
    section.preamble
      ? section.lines.join('\n')
      : [section.heading, ...section.lines].join('\n')
  )).join('\n'))
}
