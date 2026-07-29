const EMPTY_STATE = {
  version: 1,
  identity: {
    company: '',
    role: '',
    time: '',
    type: '',
  },
  projects: [],
  lastUpdatedField: '',
  lastUpdatedProjectId: '',
  nextQuestion: null,
}

const ARRAY_PATHS = {
  business: ['objects', 'problems', 'goals', 'constraints'],
  action: ['ownership', 'actions', 'decisions', 'collaboration', 'deliverables'],
  evidence: ['metrics', 'status', 'deliverables', 'feedback', 'unknowns'],
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean))]
}

function normalizeProject(project = {}, index = 0) {
  return {
    id: cleanText(project.id) || `project-${index + 1}`,
    name: cleanText(project.name) || `项目 ${index + 1}`,
    business: {
      objects: uniqueStrings(project.business?.objects),
      problems: uniqueStrings(project.business?.problems),
      goals: uniqueStrings(project.business?.goals),
      constraints: uniqueStrings(project.business?.constraints),
    },
    action: {
      ownership: uniqueStrings(project.action?.ownership),
      actions: uniqueStrings(project.action?.actions),
      decisions: uniqueStrings(project.action?.decisions),
      collaboration: uniqueStrings(project.action?.collaboration),
      deliverables: uniqueStrings(project.action?.deliverables),
    },
    evidence: {
      metrics: uniqueStrings(project.evidence?.metrics),
      status: uniqueStrings(project.evidence?.status),
      deliverables: uniqueStrings(project.evidence?.deliverables),
      feedback: uniqueStrings(project.evidence?.feedback),
      unknowns: uniqueStrings(project.evidence?.unknowns),
    },
  }
}

export function normalizeExperienceResearchState(value) {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATE }
  return {
    version: 1,
    identity: {
      company: cleanText(value.identity?.company),
      role: cleanText(value.identity?.role),
      time: cleanText(value.identity?.time),
      type: cleanText(value.identity?.type),
    },
    projects: (Array.isArray(value.projects) ? value.projects : [])
      .map(normalizeProject),
    lastUpdatedField: cleanText(value.lastUpdatedField),
    lastUpdatedProjectId: cleanText(value.lastUpdatedProjectId),
    nextQuestion: value.nextQuestion && typeof value.nextQuestion === 'object'
      ? {
        projectId: cleanText(value.nextQuestion.projectId),
        field: cleanText(value.nextQuestion.field),
      }
      : null,
  }
}

export function parseExperienceResearchState(text = '') {
  const blocks = [...String(text).matchAll(/```research-state-json\s*([\s\S]*?)\s*```/gi)]
  if (blocks.length === 0) return null
  try {
    return normalizeExperienceResearchState(JSON.parse(blocks[blocks.length - 1][1]))
  } catch {
    return null
  }
}

export function stripExperienceResearchState(text = '') {
  return String(text)
    .replace(/```research-state-json\s*[\s\S]*?(?:```|$)/gi, '')
    .trim()
}

export function getLatestExperienceResearchState(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const state = parseExperienceResearchState(message.content)
    if (state) return state
  }
  return normalizeExperienceResearchState(null)
}

function hasAny(project, group, keys = ARRAY_PATHS[group]) {
  return keys.some(key => project[group][key]?.length > 0)
}

function projectCoverage(project) {
  const business = (
    (project.business.problems.length > 0 ? 0.4 : 0)
    + (project.business.goals.length > 0 ? 0.3 : 0)
    + (project.business.objects.length > 0 ? 0.2 : 0)
    + (project.business.constraints.length > 0 ? 0.1 : 0)
  )
  const action = (
    (project.action.ownership.length > 0 ? 0.25 : 0)
    + (project.action.actions.length > 0 ? 0.35 : 0)
    + (project.action.decisions.length > 0 ? 0.2 : 0)
    + (project.action.collaboration.length > 0 ? 0.1 : 0)
    + (project.action.deliverables.length > 0 ? 0.1 : 0)
  )
  const evidenceKinds = ['metrics', 'status', 'deliverables', 'feedback']
    .filter(key => project.evidence[key].length > 0).length
  const evidence = evidenceKinds >= 2 ? 1 : evidenceKinds === 1 ? 0.65 : 0
  return { business, action, evidence }
}

function averageCoverage(projects, field) {
  if (projects.length === 0) return 0
  return projects.reduce((total, project) => total + projectCoverage(project)[field], 0) / projects.length
}

function collectFacts(projects, group, keys, limit = 3) {
  const facts = []
  const multiple = projects.length > 1
  projects.forEach(project => {
    keys.forEach(key => {
      project[group][key].forEach(value => {
        facts.push(multiple ? `${project.name}：${value}` : value)
      })
    })
  })
  const unique = uniqueStrings(facts)
  if (unique.length <= limit) return unique.join('；')
  return `${unique.slice(0, limit).join('；')}；另有 ${unique.length - limit} 项已确认`
}

function sourceIdentity(sourceExperience, state) {
  return [
    state.identity.company || sourceExperience?.company,
    state.identity.role || sourceExperience?.role,
    state.identity.time || sourceExperience?.time,
  ].map(cleanText).filter(Boolean).join(' · ')
}

export function buildExperienceResearchProgress(messages = [], sourceExperience = null, options = {}) {
  const state = getLatestExperienceResearchState(messages)
  const projects = state.projects
  const identity = sourceIdentity(sourceExperience, state)
  const baseConfirmed = Boolean(identity)
  const businessValue = collectFacts(projects, 'business', ARRAY_PATHS.business)
  const actionValue = collectFacts(projects, 'action', ARRAY_PATHS.action)
  const evidenceValue = collectFacts(projects, 'evidence', ['metrics', 'status', 'deliverables', 'feedback'])
  const latestGroup = state.lastUpdatedField.split('.')[0]

  const progress = options.complete
    ? 100
    : Math.min(95, Math.round(
      (baseConfirmed ? 15 : 0)
      + averageCoverage(projects, 'business') * 25
      + averageCoverage(projects, 'action') * 35
      + averageCoverage(projects, 'evidence') * 25,
    ))

  const fields = [
    {
      id: 'base',
      label: '基础信息',
      value: identity || '等待开始',
      confirmed: baseConfirmed,
      highlight: false,
    },
    {
      id: 'business',
      label: '业务背景与目标',
      value: businessValue || '待确认',
      confirmed: projects.some(project => hasAny(project, 'business')),
      highlight: latestGroup === 'business',
    },
    {
      id: 'action',
      label: '个人贡献与行动',
      value: actionValue || '待确认',
      confirmed: projects.some(project => hasAny(project, 'action')),
      highlight: latestGroup === 'action',
    },
    {
      id: 'evidence',
      label: '结果与证据',
      value: evidenceValue || '待补充',
      confirmed: projects.some(project => hasAny(project, 'evidence', ['metrics', 'status', 'deliverables', 'feedback'])),
      highlight: latestGroup === 'evidence',
    },
  ]

  return {
    progress,
    fields,
    latestField: latestGroup,
    projectCount: projects.length,
    state,
    summary: fields
      .filter(field => field.confirmed)
      .map(field => `${field.label}：${field.value}`)
      .join('\n'),
  }
}
