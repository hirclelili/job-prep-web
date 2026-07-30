import React, { useEffect, useMemo, useRef, useState } from 'react'
import { parseJsonFromMarkdown, runTextSkill } from '../skills/core'
import {
  resumeDirectionRecommendationSkill,
  resumeGenerateSkill,
  resumeLocalRewriteSkill,
  resumeReviewSkill,
  resumeStrategyRefineSkill,
  resumeStrategySkill,
  validateResumeStrategy,
} from '../skills/resumeSkills'
import { subscribeAgentArtifacts } from '../agent/events'
import { deleteResume, getOriginalResume, getProfile, getResumes, saveProfile, saveResume } from '../utils/storage'
import { useApp } from '../contexts/AppContext'
import { buildResumeDocumentHtml, downloadResumeImage, downloadResumePdf, downloadResumeWord } from '../utils/resumeExport'
import {
  dedupeResumeExperienceEntries,
  inferExperienceType,
  normalizeResumeChronology,
  normalizeResumeExperiencePlacement,
  normalizeResumeHeadingLevels,
  removeEmptyResumeSections,
  resumeExperienceDateScore,
} from '../utils/resumeNormalize'
import { getJobSearchEnrichment } from '../services/search'
import { useLocation, useNavigate } from 'react-router-dom'
import { clearDraft, DRAFT_KEYS, formatDraftTime, readDraft, writeDraft } from '../utils/draftStorage'

const targetOptions = [
  '通用实习简历',
  '产品岗',
  '运营岗',
  '数据分析岗',
  'AI 产品 / 内容策略',
  '自定义方向',
]

const STRATEGY_VERSION = 1
const DIRECTION_RECOMMENDATION_VERSION = 2

function buildExperienceScope(experiences = []) {
  return experiences
    .map(exp => `${exp.id}:${exp.savedAt || exp.updatedAt || ''}`)
    .sort()
    .join('|')
}

function includedPlan(strategy) {
  return [...(strategy?.experiencePlan || [])]
    .filter(item => item.treatment !== 'exclude')
    .sort((a, b) => a.order - b.order)
}

function reindexStrategyPlan(plan = []) {
  let order = 0
  return plan.map(item => {
    if (item.treatment === 'exclude') return { ...item, order: 0, bulletCount: 0 }
    order += 1
    return { ...item, order }
  })
}

function sortStrategyPlanForDisplay(plan = [], experiences = []) {
  const byId = new Map(experiences.map(item => [item.id, item]))
  const typeOrder = { internship: 0, fulltime: 0, project: 1, campus: 2 }
  return [...plan].sort((a, b) => {
    if (a.treatment === 'exclude' && b.treatment !== 'exclude') return 1
    if (a.treatment !== 'exclude' && b.treatment === 'exclude') return -1
    const expA = byId.get(a.experienceId)
    const expB = byId.get(b.experienceId)
    const typeDiff = (typeOrder[inferExperienceType(expA)] ?? 9) - (typeOrder[inferExperienceType(expB)] ?? 9)
    if (typeDiff !== 0) return typeDiff
    return resumeExperienceDateScore(expB) - resumeExperienceDateScore(expA)
  })
}

function normalizeResumeContent(markdown, experiences) {
  return normalizeResumeChronology(
    dedupeResumeExperienceEntries(
      normalizeResumeExperiencePlacement(
        removeEmptyResumeSections(normalizeResumeHeadingLevels(markdown))
      ),
      experiences
    ),
    experiences
  )
}

const defaultResumeSections = [
  { id: 'education', title: '教育背景', enabled: true, locked: true },
  { id: 'internship', title: '实习经历', enabled: true, locked: true },
  { id: 'project', title: '项目经历', enabled: true, locked: true },
  { id: 'campus', title: '校园经历', enabled: true, optional: true },
  { id: 'awards', title: '获奖成就', enabled: true, optional: true },
  { id: 'summary', title: '个人介绍', enabled: false, optional: true },
  { id: 'skills', title: '技能', enabled: true, optional: true },
]

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function experienceTitle(exp) {
  return exp.title || [exp.company, exp.role, exp.time].filter(Boolean).join(' · ') || '未命名经历'
}

function suggestResumeTitle(target, customTarget, jdText) {
  const base = target === '自定义方向' ? customTarget.trim() : target
  const jdTitle = jdText.match(/(?:岗位|职位|Job Title|Title)[：:]\s*([^\n]+)/i)?.[1]?.trim()
  return jdTitle ? jdTitle + ' 定制版' : (base || '通用') + '简历'
}

function listToText(list) {
  return Array.isArray(list) ? list.join('\n') : ''
}

function textToList(text) {
  return text.split('\n').map(item => item.trim()).filter(Boolean)
}

function educationToText(education) {
  if (!Array.isArray(education)) return ''
  return education.map(edu => [edu.school, edu.degree, edu.major, edu.time, ...(edu.details || [])].filter(Boolean).join('｜')).join('\n')
}

function textToEducation(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[｜|]/).map(item => item.trim()).filter(Boolean)
    return {
      school: parts[0] || '',
      degree: parts[1] || '',
      major: parts[2] || '',
      time: parts[3] || '',
      details: parts.slice(4),
    }
  })
}

function normalizeProfile(profile) {
  return {
    name: profile.name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    city: profile.city || '',
    summary: profile.summary || '',
    education: profile.education || [],
    skills: profile.skills || [],
    certificates: profile.certificates || [],
    links: profile.links || [],
    photoDataUrl: profile.photoDataUrl || '',
  }
}

function normalizeResumeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return defaultResumeSections.map(section => ({ ...section }))
  const byId = new Map(sections.map(section => [section.id, section]))
  const knownIds = new Set(defaultResumeSections.map(section => section.id))
  const normalizeOne = section => {
    const defaultSection = defaultResumeSections.find(item => item.id === section.id)
    if (!defaultSection) return section
    return {
      ...defaultSection,
      ...section,
      locked: defaultSection.locked,
      optional: defaultSection.optional,
      title: defaultSection.title,
    }
  }
  const ordered = sections.map(normalizeOne)
  const missing = defaultResumeSections
    .filter(section => !byId.has(section.id))
    .map(section => ({ ...section }))
  const extras = ordered.filter(section => section?.id && !knownIds.has(section.id))
  const knownOrdered = ordered.filter(section => section?.id && knownIds.has(section.id))
  return [...knownOrdered, ...missing, ...extras]
}

function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function ResumeVersionCard({ resume, active, onOpen, onDelete }) {
  return (
    <div className={'prep-panel-tight p-3 ' + (active ? 'shadow-[5px_5px_0_rgba(85,223,241,0.20)]' : '')}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpen(resume)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-black text-[#171321]">{resume.title}</p>
          <p className="mt-1 text-xs font-semibold text-[#8a8296]">{resume.target || '未设置目标'} · {formatDate(resume.updatedAt)}</p>
        </button>
        <button
          onClick={() => onDelete(resume.id)}
          className="prep-danger min-h-[28px] shrink-0 px-2"
        >
          删除
        </button>
      </div>
    </div>
  )
}

function ExportMenu({ onWord, onPdf, onPng, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const run = async (action) => {
    setOpen(false)
    setExporting(true)
    try {
      await action()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        disabled={disabled || exporting}
        className="prep-ghost disabled:cursor-not-allowed disabled:opacity-40"
      >
        {exporting ? '导出中…' : '导出'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-lg border border-[#171321]/10 bg-white p-1.5 shadow-[0_14px_38px_rgba(62,48,86,0.18)]">
          <button onClick={() => run(onWord)} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-[#41394d] hover:bg-[#f4f1f7]">Word 文档</button>
          <button onClick={() => run(onPdf)} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-[#41394d] hover:bg-[#f4f1f7]">PDF 文件</button>
          <button onClick={() => run(onPng)} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-[#41394d] hover:bg-[#f4f1f7]">PNG 图片</button>
        </div>
      )}
    </div>
  )
}

function editableLine(line = '') {
  const trimmed = line.trim()
  if (!trimmed) return { type: 'blank', content: '' }
  if (/^<!--[\s\S]*-->$/.test(trimmed)) return { type: 'metadata', content: trimmed }
  if (/^##(?:\s+|$)/.test(trimmed)) return { type: 'section', content: trimmed.replace(/^##\s*/, '').replace(/\*\*/g, '') }
  if (/^###(?:\s+|$)/.test(trimmed)) return { type: 'entry', content: trimmed.replace(/^###\s*/, '').replace(/\*\*/g, '') }
  if (/^[-*•]\s+/.test(trimmed)) return { type: 'bullet', content: trimmed.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '') }
  return { type: 'paragraph', content: line.replace(/\*\*/g, '').replace(/`/g, '') }
}

function updateResumeLine(markdown, lineIndex, nextContent) {
  const lines = String(markdown || '').split('\n')
  const current = editableLine(lines[lineIndex])
  const clean = String(nextContent || '').replace(/\*\*/g, '').replace(/`/g, '')
  if (current.type === 'entry') lines[lineIndex] = `### ${clean}`
  else if (current.type === 'bullet') lines[lineIndex] = clean.trim() ? `- ${clean}` : ''
  else lines[lineIndex] = clean
  return lines.join('\n')
}

function buildResumeRewriteTarget(markdown, lineIndex, type) {
  const lines = String(markdown || '').split('\n')
  const item = editableLine(lines[lineIndex])
  let sectionTitle = ''
  let entryTitle = ''
  for (let index = lineIndex; index >= 0; index -= 1) {
    const previous = editableLine(lines[index])
    if (!entryTitle && previous.type === 'entry') entryTitle = previous.content
    if (previous.type === 'section') {
      sectionTitle = previous.content
      break
    }
  }
  if (type === 'bullet') {
    return {
      type,
      title: item.content.slice(0, 32),
      content: item.content,
      entryTitle,
      sectionTitle,
      startIndex: lineIndex,
      endIndex: lineIndex + 1,
    }
  }

  let endIndex = lineIndex + 1
  while (endIndex < lines.length && !/^##(?:#)?\s+/.test(lines[endIndex].trim())) endIndex += 1
  return {
    type: 'entry',
    title: item.content,
    content: lines.slice(lineIndex, endIndex).join('\n').trim(),
    entryTitle: item.content,
    sectionTitle,
    startIndex: lineIndex,
    endIndex,
  }
}

function replaceResumeRewriteTarget(markdown, target, replacement) {
  const lines = String(markdown || '').split('\n')
  const next = target.type === 'bullet'
    ? [`- ${String(replacement || '').replace(/^[-*•]\s*/, '').trim()}`]
    : String(replacement || '').trim().split('\n')
  lines.splice(target.startIndex, target.endIndex - target.startIndex, ...next)
  return lines.join('\n')
}

function normalizeResumeIdentity(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[\s|｜·•—–_\-~～（）()【】[\]：:]/g, '')
}

function findRewriteExperience(target, experiences = []) {
  const heading = normalizeResumeIdentity(target?.entryTitle || target?.title)
  if (!heading) return null

  const ranked = experiences.map(experience => {
    const fields = [
      experience.title,
      experience.company,
      experience.role,
      experience.projectName,
      experience.name,
    ].filter(Boolean).map(normalizeResumeIdentity)
    const score = fields.reduce((total, field) => {
      if (!field) return total
      if (heading.includes(field) || field.includes(heading)) return total + Math.min(field.length, 30)
      return total
    }, 0)
    return { experience, score }
  }).sort((a, b) => b.score - a.score)

  return ranked[0]?.score >= 2 ? ranked[0].experience : null
}

function ResumeContentEditor({ value, onChange, onRewrite, profile }) {
  const lines = String(value || '').split('\n')
  const contacts = [profile?.phone, profile?.email, profile?.city].filter(Boolean)
  const canRewriteAt = index => {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const item = editableLine(lines[cursor])
      if (item.type === 'section') return /实习|工作|项目|校园/.test(item.content)
    }
    return false
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#eeebf3] px-5 py-6">
      <article className="mx-auto min-h-full max-w-[820px] bg-white px-9 py-8 shadow-[0_14px_45px_rgba(62,48,86,0.12)]">
        {(profile?.name || contacts.length > 0) && (
          <header className="mb-5 border-b-2 border-[#171321] pb-4">
            {profile?.name && <h2 className="text-2xl font-black text-[#171321]">{profile.name}</h2>}
            {contacts.length > 0 && <p className="mt-1 text-sm text-[#41394d]">{contacts.join(' | ')}</p>}
          </header>
        )}
        <div className="space-y-3">
        {lines.map((line, index) => {
          const item = editableLine(line)
          if (item.type === 'blank' || item.type === 'metadata') return null
          if (item.type === 'section') {
            return (
              <div key={index} className="border-b border-[#171321]/15 pb-2 pt-4 first:pt-0">
                <p className="text-base font-black text-[#171321]">{item.content}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#8a8296]">栏目标题由系统维护</p>
              </div>
            )
          }
          if (item.type === 'entry') {
            const canRewrite = onRewrite && canRewriteAt(index)
            return (
              <div key={index} className="group relative">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-[#8a8296]">经历或教育条目</span>
                  {canRewrite && (
                    <button
                      onClick={() => onRewrite(buildResumeRewriteTarget(value, index, 'entry'))}
                      className="rounded-md bg-[#725cff]/6 px-2 py-1 text-[11px] font-bold text-[#725cff] hover:bg-[#725cff]/12"
                    >
                      AI 优化整段
                    </button>
                  )}
                </div>
                <input
                  value={item.content}
                  onChange={event => {
                    if (event.target.value.trim()) onChange(updateResumeLine(value, index, event.target.value))
                  }}
                  className="w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm font-black text-[#171321] outline-none hover:border-[#171321]/12 focus:border-[#725cff]/45"
                />
              </div>
            )
          }
          if (item.type === 'bullet') {
            const canRewrite = onRewrite && canRewriteAt(index)
            return (
              <div key={index} className="group flex items-start gap-2">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#171321]" />
                <textarea
                  value={item.content}
                  onChange={event => onChange(updateResumeLine(value, index, event.target.value))}
                  rows={Math.max(1, Math.ceil(item.content.length / 54))}
                  className="min-h-[36px] w-full resize-y border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm leading-6 text-[#292334] outline-none hover:border-[#171321]/10 focus:border-[#725cff]/40"
                />
                {canRewrite && (
                  <button
                    onClick={() => onRewrite(buildResumeRewriteTarget(value, index, 'bullet'))}
                    className="mt-1 shrink-0 rounded-md bg-[#725cff]/6 px-2 py-1 text-[11px] font-bold text-[#725cff] hover:bg-[#725cff]/12"
                  >
                    AI
                  </button>
                )}
              </div>
            )
          }
          return (
            <textarea
              key={index}
              value={item.content}
              onChange={event => onChange(updateResumeLine(value, index, event.target.value))}
              rows={Math.max(1, Math.ceil(item.content.length / 58))}
              className="min-h-[36px] w-full resize-y border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm leading-6 text-[#292334] outline-none hover:border-[#171321]/10 focus:border-[#725cff]/40"
            />
          )
        })}
        </div>
      </article>
    </div>
  )
}

export default function ResumePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const incomingJob = location.state || {}
  const incomingJobId = incomingJob.fromJobId || incomingJob.jobId || ''
  const { settings, isConfigured, setShowSettings, experiences } = useApp()
  const [initialDraft] = useState(() => {
    const draft = readDraft(DRAFT_KEYS.resume)
    if (!draft) return null
    const draftJobId = draft.data?.jobId || ''
    if (incomingJobId && draftJobId !== incomingJobId) return null
    if (incomingJob.target) {
      const draftTarget = draft.data?.target === '自定义方向'
        ? draft.data?.customTarget
        : draft.data?.target
      if (draftTarget !== incomingJob.target) return null
      if (incomingJob.targetSource && draft.data?.targetSource !== incomingJob.targetSource) return null
      if (incomingJob.strategyMode && draft.data?.strategyMode !== incomingJob.strategyMode) return null
    }
    return draft
  })
  const initialResumeDraft = initialDraft?.data || {}
  const hasInitialResumeWork = Boolean(
    initialResumeDraft.outputText?.trim()
    || initialResumeDraft.resumeStrategy
    || initialResumeDraft.confirmedStrategy
    || initialResumeDraft.directionRecommendations?.length
    || initialResumeDraft.resumeReview?.trim()
    || initialResumeDraft.jdText?.trim()
    || initialResumeDraft.strategyInstruction?.trim()
    || initialResumeDraft.titleInput?.trim()
  )
  const [resumes, setResumes] = useState(() => getResumes())
  const [pageMode, setPageMode] = useState(() => {
    if (hasInitialResumeWork) {
      return ['editor', 'library'].includes(initialResumeDraft.pageMode)
        ? initialResumeDraft.pageMode
        : 'editor'
    }
    if (incomingJob.mode === 'editor' || incomingJob.mode === 'library') return incomingJob.mode
    return getResumes().length ? 'library' : 'editor'
  })
  const [originalResume] = useState(() => getOriginalResume())
  const [profile, setProfile] = useState(() => normalizeProfile(getProfile()))
  const [profileSaved, setProfileSaved] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => {
    const availableIds = new Set(experiences.map(experience => experience.id))
    const strategyIds = includedPlan(initialResumeDraft.confirmedStrategy).map(item => item.experienceId)
    const restored = (strategyIds.length ? strategyIds : (initialResumeDraft.selectedIds || []))
      .filter(id => availableIds.has(id))
    return restored.length ? restored : experiences.map(experience => experience.id)
  })
  const [resumeSections, setResumeSections] = useState(() => normalizeResumeSections(initialResumeDraft.resumeSections))
  const [dragSectionId, setDragSectionId] = useState('')
  const [target, setTarget] = useState(() => (
    initialResumeDraft.target
    || '自定义方向'
  ))
  const [customTarget, setCustomTarget] = useState(() => (
    initialResumeDraft.customTarget ?? incomingJob.target ?? ''
  ))
  const [jdText, setJdText] = useState(() => initialResumeDraft.jdText ?? incomingJob.jdText ?? '')
  const [titleInput, setTitleInput] = useState(() => initialResumeDraft.titleInput ?? incomingJob.title ?? '')
  const [outputText, setOutputText] = useState(() => normalizeResumeContent(initialResumeDraft.outputText || '', experiences))
  const [directionRecommendations, setDirectionRecommendations] = useState(() => (
    initialResumeDraft.directionRecommendationVersion === DIRECTION_RECOMMENDATION_VERSION
      ? initialResumeDraft.directionRecommendations || []
      : []
  ))
  const [directionScope, setDirectionScope] = useState(() => initialResumeDraft.directionScope || buildExperienceScope(experiences))
  const [selectedDirectionId, setSelectedDirectionId] = useState(() => initialResumeDraft.selectedDirectionId || '')
  const [targetSource, setTargetSource] = useState(() => (
    initialResumeDraft.targetSource || incomingJob.targetSource || (incomingJob.jdText ? 'jd' : (initialResumeDraft.selectedDirectionId ? 'recommended' : 'custom'))
  ))
  const [directionsLoading, setDirectionsLoading] = useState(false)
  const [resumeStrategy, setResumeStrategy] = useState(() => initialResumeDraft.resumeStrategy || null)
  const [confirmedStrategy, setConfirmedStrategy] = useState(() => initialResumeDraft.confirmedStrategy || null)
  const [strategyCollapsed, setStrategyCollapsed] = useState(() => Boolean(initialResumeDraft.outputText && initialResumeDraft.confirmedStrategy))
  const [strategyInstruction, setStrategyInstruction] = useState(() => initialResumeDraft.strategyInstruction || '')
  const [resumeReview, setResumeReview] = useState(() => initialResumeDraft.resumeReview || '')
  const [searchContext, setSearchContext] = useState(() => initialResumeDraft.searchContext || '')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [activeResumeId, setActiveResumeId] = useState(() => initialResumeDraft.activeResumeId || '')
  const [sourceResumeId, setSourceResumeId] = useState(() => initialResumeDraft.sourceResumeId || incomingJob.sourceResumeId || '')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(() => initialDraft?.updatedAt || '')
  const [restoredDraft, setRestoredDraft] = useState(() => hasInitialResumeWork)
  const [detailResumeId, setDetailResumeId] = useState(() => incomingJob.resumeId || initialResumeDraft.detailResumeId || getResumes()[0]?.id || '')
  const [resumeViewMode, setResumeViewMode] = useState(() => initialResumeDraft.resumeViewMode === 'preview' ? 'preview' : 'edit')
  const [localRewriteTarget, setLocalRewriteTarget] = useState(null)
  const [localRewriteInstruction, setLocalRewriteInstruction] = useState('')
  const [localRewritePreview, setLocalRewritePreview] = useState('')
  const [localRewriteLoading, setLocalRewriteLoading] = useState(false)
  const [localRewriteError, setLocalRewriteError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const autoAnalyzeStartedRef = useRef(false)
  const draftCleanupDoneRef = useRef(false)

  const detailResume = useMemo(() => {
    if (!resumes.length) return null
    return resumes.find(resume => resume.id === detailResumeId) || resumes[0]
  }, [detailResumeId, resumes])

  const targetLabel = target === '自定义方向' ? customTarget.trim() : target
  const strategyMode = jdText.trim()
    ? 'jd'
    : (targetLabel === '通用实习简历' ? 'baseline' : 'direction')
  const strategyModeLabel = strategyMode === 'baseline'
    ? '通用母版'
    : strategyMode === 'jd'
      ? 'JD 定制版'
      : '岗位方向版'
  const currentExperienceScope = buildExperienceScope(experiences)
  const strategyIsValid = validateResumeStrategy(resumeStrategy, experiences) === true
  const confirmedStrategyIsValid = validateResumeStrategy(confirmedStrategy, experiences) === true
  const showStrategyWorkspace = Boolean(resumeStrategy && !strategyCollapsed)
  const canGenerate = confirmedStrategyIsValid && !!targetLabel && !loading && !analysisLoading && !reviewLoading
  const canAnalyze = experiences.length > 0 && !!targetLabel && !loading && !analysisLoading && !reviewLoading && !directionsLoading
  const canReview = !!outputText.trim() && confirmedStrategyIsValid && !loading && !analysisLoading && !reviewLoading
  const hasResumeDraftWork = Boolean(
    outputText.trim()
    || resumeStrategy
    || confirmedStrategy
    || directionRecommendations.length
    || resumeReview.trim()
    || jdText.trim()
    || strategyInstruction.trim()
    || titleInput.trim()
  )

  const resolveSearchContext = async () => {
    if (searchContext.trim()) return searchContext
    if (!jdText.trim()) return ''
    const enrichment = await getJobSearchEnrichment({
      purpose: 'resume',
      jobTitle: incomingJob.target || incomingJob.jobTitle || '',
      jdText,
      targetLabel,
    })
    const nextContext = enrichment.contextText || ''
    setSearchContext(nextContext)
    return nextContext
  }

  useEffect(() => {
    if (!resumes.length) {
      setPageMode('editor')
      return
    }
    if (!detailResumeId || !resumes.some(resume => resume.id === detailResumeId)) {
      setDetailResumeId(resumes[0].id)
    }
  }, [detailResumeId, resumes])

  useEffect(() => {
    if (directionScope === currentExperienceScope) return
    setDirectionScope(currentExperienceScope)
    setDirectionRecommendations([])
    setSelectedDirectionId('')
    setResumeStrategy(null)
    setConfirmedStrategy(null)
    setSelectedIds(experiences.map(experience => experience.id))
    setResumeReview('')
  }, [currentExperienceScope, directionScope, experiences])

  useEffect(() => subscribeAgentArtifacts(artifact => {
    if (artifact?.type === 'resume.directions') {
      const parsed = parseJsonFromMarkdown(artifact.content || '')
      if (parsed?.directions) setDirectionRecommendations(parsed.directions)
      setDirectionsLoading(false)
    }
    if (artifact?.type === 'resume.strategy') {
      const parsed = parseJsonFromMarkdown(artifact.content || '')
      if (parsed?.experiencePlan) {
        setResumeStrategy(parsed)
        setConfirmedStrategy(null)
        setStrategyCollapsed(false)
      }
      setError('')
      setAnalysisLoading(false)
    }
    if (artifact?.type === 'resume.output') {
      setOutputText(normalizeResumeContent(artifact.content || '', experiences))
      setTitleInput(artifact.title || suggestResumeTitle(target, customTarget, jdText))
      setResumeViewMode('edit')
      setActiveResumeId('')
      setError('')
      setLoading(false)
    }
    if (artifact?.type === 'resume.review') {
      setResumeReview(artifact.content || '')
      setError('')
      setReviewLoading(false)
    }
  }), [customTarget, experiences, jdText, target])

  useEffect(() => {
    if (draftCleanupDoneRef.current || loading || !outputText.trim()) return
    draftCleanupDoneRef.current = true
    const normalized = normalizeResumeContent(outputText, experiences)
    if (normalized !== outputText) setOutputText(normalized)
  }, [experiences, loading, outputText])

  useEffect(() => {
    const saved = writeDraft(DRAFT_KEYS.resume, {
      pageMode,
      jobId: incomingJobId || initialResumeDraft.jobId || '',
      jobTitle: incomingJob.target || initialResumeDraft.jobTitle || '',
      selectedIds,
      resumeSections,
      target,
      customTarget,
      targetSource,
      strategyMode,
      selectedDirectionId,
      directionRecommendations,
      directionRecommendationVersion: DIRECTION_RECOMMENDATION_VERSION,
      directionScope,
      jdText,
      titleInput,
      outputText,
      resumeStrategy,
      confirmedStrategy,
      sourceResumeId,
      strategyInstruction,
      resumeReview,
      searchContext,
      activeResumeId,
      detailResumeId,
      resumeViewMode,
    })
    if (saved) setDraftUpdatedAt(saved.updatedAt)
  }, [
    activeResumeId,
    confirmedStrategy,
    customTarget,
    detailResumeId,
    directionRecommendations,
    directionScope,
    incomingJob.target,
    incomingJobId,
    initialResumeDraft.jobId,
    initialResumeDraft.jobTitle,
    jdText,
    outputText,
    pageMode,
    resumeReview,
    resumeViewMode,
    resumeStrategy,
    resumeSections,
    searchContext,
    selectedIds,
    selectedDirectionId,
    sourceResumeId,
    strategyInstruction,
    strategyMode,
    target,
    targetSource,
    titleInput,
  ])

  const updateProfile = (field, value) => {
    setProfileSaved(false)
    setResumeReview('')
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  const persistProfile = () => {
    const saved = saveProfile(profile)
    setProfile(normalizeProfile(saved))
    setProfileSaved(true)
  }

  const handlePhotoUpload = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => updateProfile('photoDataUrl', reader.result)
    reader.readAsDataURL(file)
  }

  const exportPayload = () => ({
    title: titleInput || '简历版本',
    content: outputText,
    profile,
  })

  const toggleSection = (id) => {
    setResumeReview('')
    setResumeSections(sections => sections.map(section => (
      section.id === id && !section.locked
        ? { ...section, enabled: !section.enabled }
        : section
    )))
  }

  const moveSection = (id, direction) => {
    setResumeReview('')
    setResumeSections(sections => {
      const index = sections.findIndex(section => section.id === id)
      return moveItem(sections, index, index + direction)
    })
  }

  const dropSection = (targetId) => {
    if (!dragSectionId || dragSectionId === targetId) return
    setResumeReview('')
    setResumeSections(sections => {
      const fromIndex = sections.findIndex(section => section.id === dragSectionId)
      const toIndex = sections.findIndex(section => section.id === targetId)
      return moveItem(sections, fromIndex, toIndex)
    })
    setDragSectionId('')
  }

  const resetStrategy = () => {
    if (outputText.trim()) {
      if (activeResumeId) setSourceResumeId(activeResumeId)
      setActiveResumeId('')
      setOutputText('')
      setTitleInput('')
    }
    setResumeStrategy(null)
    setConfirmedStrategy(null)
    setSelectedIds(experiences.map(experience => experience.id))
    setStrategyInstruction('')
    setResumeReview('')
    setStrategyCollapsed(false)
  }

  const handleRecommendDirections = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!experiences.length || directionsLoading) return
    setDirectionsLoading(true)
    setError('')
    try {
      const result = await runTextSkill({
        skill: resumeDirectionRecommendationSkill,
        settings,
        input: { experiences },
      })
      setDirectionRecommendations(result.directions || [])
      setDirectionScope(currentExperienceScope)
    } catch (err) {
      setError(err.message)
    } finally {
      setDirectionsLoading(false)
    }
  }

  const selectRecommendedDirection = (direction) => {
    setTarget('自定义方向')
    setCustomTarget(direction.name)
    setTargetSource('recommended')
    setSelectedDirectionId(direction.id)
    setSearchContext('')
    resetStrategy()
  }

  const updateStrategy = (updater) => {
    setResumeStrategy(current => {
      if (!current) return current
      return typeof updater === 'function' ? updater(current) : updater
    })
    setConfirmedStrategy(null)
    setResumeReview('')
    setStrategyCollapsed(false)
  }

  const toggleStrategyExperience = (experienceId) => {
    const currentItem = resumeStrategy?.experiencePlan?.find(item => item.experienceId === experienceId)
    if (currentItem?.treatment === 'exclude') {
      const experience = experiences.find(item => item.id === experienceId)
      const type = inferExperienceType(experience)
      const sectionId = type === 'campus' ? 'campus' : type === 'project' ? 'project' : 'internship'
      setResumeSections(sections => sections.map(section => (
        section.id === sectionId ? { ...section, enabled: true } : section
      )))
    }
    updateStrategy(strategy => {
      const next = strategy.experiencePlan.map(item => {
        if (item.experienceId !== experienceId) return { ...item }
        if (item.treatment === 'exclude') {
          return {
            ...item,
            treatment: 'include',
            bulletCount: 2,
            order: 999,
            angle: item.angle?.trim() || '结合当前目标方向，突出这段经历中最相关的职责、行动和结果。',
            reason: item.reason?.trim() || '用户选择将这段经历加入当前简历。',
            userOverride: 'include',
          }
        }
        return { ...item, treatment: 'exclude', order: 0, bulletCount: 0, userOverride: 'exclude' }
      })
      const included = next
        .filter(item => item.treatment !== 'exclude')
        .sort((a, b) => a.order - b.order)
      const excluded = next.filter(item => item.treatment === 'exclude')
      return { ...strategy, experiencePlan: reindexStrategyPlan([...included, ...excluded]) }
    })
  }

  const updateStrategyItem = (experienceId, patch) => {
    updateStrategy(strategy => ({
      ...strategy,
      experiencePlan: strategy.experiencePlan.map(item => (
        item.experienceId === experienceId ? { ...item, ...patch, userOverride: 'include' } : item
      )),
    }))
  }

  const handleAnalyzeFit = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!canAnalyze) return

    const savedProfile = saveProfile(profile)
    setProfile(normalizeProfile(savedProfile))
    setResumeStrategy(null)
    setConfirmedStrategy(null)
    setResumeReview('')
    setStrategyInstruction('')
    setError('')
    setAnalysisLoading(true)
    setStrategyCollapsed(false)

    try {
      const externalContext = await resolveSearchContext()
      const result = await runTextSkill({
        skill: resumeStrategySkill,
        settings,
        input: {
          targetLabel,
          targetSource,
          strategyMode,
          profile,
          jdText,
          experiences,
          resumeSections,
          originalResume,
          searchContext: externalContext,
        },
      })
      setResumeStrategy(result)
      setStrategyCollapsed(false)
      setSelectedIds(includedPlan(result).map(item => item.experienceId))
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalysisLoading(false)
    }
  }

  useEffect(() => {
    if (!incomingJob.autoAnalyzeStrategy || autoAnalyzeStartedRef.current) return
    if (resumeStrategy || confirmedStrategy || analysisLoading || !canAnalyze) return
    if (!isConfigured) {
      setShowSettings(true)
      return
    }
    autoAnalyzeStartedRef.current = true
    handleAnalyzeFit()
  }, [
    analysisLoading,
    canAnalyze,
    confirmedStrategy,
    incomingJob.autoAnalyzeStrategy,
    isConfigured,
    resumeStrategy,
    setShowSettings,
  ])



  const handleRefineStrategy = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!resumeStrategy || !strategyInstruction.trim() || analysisLoading) return

    setError('')
    setAnalysisLoading(true)
    try {
      const externalContext = searchContext || await resolveSearchContext()
      const result = await runTextSkill({
        skill: resumeStrategyRefineSkill,
        settings,
        input: {
          targetLabel,
          targetSource,
          strategyMode,
          profile,
          jdText,
          experiences,
          resumeStrategy,
          strategyInstruction,
          resumeSections,
          originalResume,
          searchContext: externalContext,
        },
      })
      setResumeStrategy(result)
      setConfirmedStrategy(null)
      setSelectedIds(includedPlan(result).map(item => item.experienceId))
      setStrategyInstruction('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleConfirmStrategy = () => {
    const issue = validateResumeStrategy(resumeStrategy, experiences)
    if (issue !== true) {
      setError(issue)
      return
    }
    const confirmed = JSON.parse(JSON.stringify(resumeStrategy))
    setConfirmedStrategy(confirmed)
    setSelectedIds(includedPlan(confirmed).map(item => item.experienceId))
    setStrategyCollapsed(false)
    setError('')
  }


  const handleReviewResume = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!canReview) return

    setError('')
    setResumeReview('')
    setReviewLoading(true)
    try {
      await runTextSkill({
        skill: resumeReviewSkill,
        settings,
        input: {
          targetLabel,
          targetSource,
          strategyMode,
          profile,
          jdText,
          experiences,
          confirmedStrategy,
          outputText,
          searchContext,
        },
        onToken: setResumeReview,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setReviewLoading(false)
    }
  }


  const generateResumeWithStrategy = async (strategyToUse) => {
    if (!isConfigured) { setShowSettings(true); return }
    const issue = validateResumeStrategy(strategyToUse, experiences)
    if (issue !== true || !targetLabel || loading || analysisLoading || reviewLoading) {
      if (issue !== true) setError(issue)
      return
    }

    const previousOutput = outputText
    const savedProfile = saveProfile(profile)
    setProfile(normalizeProfile(savedProfile))

    const nextTitle = suggestResumeTitle(target, customTarget, jdText)
    if (activeResumeId) setSourceResumeId(activeResumeId)
    setTitleInput(nextTitle)
    setActiveResumeId('')
    setStrategyCollapsed(true)
    setResumeViewMode('edit')
    let latestGenerated = ''
    setResumeReview('')
    setRestoredDraft(false)
    setError('')
    setLoading(true)

    try {
      const externalContext = await resolveSearchContext()
      const result = await runTextSkill({
        skill: resumeGenerateSkill,
        settings,
        input: {
          targetLabel,
          targetSource,
          strategyMode,
          profile,
          jdText,
          experiences,
          confirmedStrategy: strategyToUse,
          resumeSections,
          originalResume,
          searchContext: externalContext,
        },
        onToken: value => {
          latestGenerated = value
          setOutputText(value)
        },
      })
      setOutputText(normalizeResumeContent(result, experiences))
    } catch (err) {
      setOutputText(latestGenerated.trim() || previousOutput)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = () => generateResumeWithStrategy(confirmedStrategy)

  const handleConfirmAndGenerate = () => {
    const issue = validateResumeStrategy(resumeStrategy, experiences)
    if (issue !== true) {
      setError(issue)
      return
    }
    const confirmed = JSON.parse(JSON.stringify(resumeStrategy))
    setConfirmedStrategy(confirmed)
    setSelectedIds(includedPlan(confirmed).map(item => item.experienceId))
    setError('')
    generateResumeWithStrategy(confirmed)
  }

  const handlePrimaryResumeAction = () => {
    if (!resumeStrategy) {
      handleAnalyzeFit()
      return
    }
    if (!confirmedStrategyIsValid) {
      handleConfirmAndGenerate()
      return
    }
    handleGenerate()
  }

  const primaryActionDisabled = !resumeStrategy
    ? !canAnalyze
    : confirmedStrategyIsValid
      ? !canGenerate
      : !strategyIsValid || loading || analysisLoading || reviewLoading

  const primaryActionLabel = analysisLoading
    ? '正在制定选材策略…'
    : loading
      ? '正在生成简历…'
      : !resumeStrategy
        ? '确认配置，生成选材策略'
        : confirmedStrategyIsValid
          ? '按当前策略重新生成'
          : '确认策略并生成简历'



  const openLocalRewrite = rewriteTarget => {
    const sourceExperience = findRewriteExperience(rewriteTarget, experiences)
    setLocalRewriteTarget({ ...rewriteTarget, sourceExperience })
    setLocalRewriteInstruction('')
    setLocalRewritePreview('')
    setLocalRewriteError(sourceExperience ? '' : '没有匹配到对应的经历资产，请先检查这段经历的标题。')
  }

  const closeLocalRewrite = () => {
    if (localRewriteLoading) return
    setLocalRewriteTarget(null)
    setLocalRewriteInstruction('')
    setLocalRewritePreview('')
    setLocalRewriteError('')
  }

  const handleGenerateLocalRewrite = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!localRewriteTarget?.sourceExperience || !localRewriteInstruction.trim() || localRewriteLoading) return
    setLocalRewriteLoading(true)
    setLocalRewritePreview('')
    setLocalRewriteError('')
    try {
      const result = await runTextSkill({
        skill: resumeLocalRewriteSkill,
        settings,
        input: {
          type: localRewriteTarget.type,
          content: localRewriteTarget.content,
          instruction: localRewriteInstruction,
          targetLabel,
          jdText,
          sourceExperience: localRewriteTarget.sourceExperience,
        },
      })
      setLocalRewritePreview(result)
    } catch (err) {
      setLocalRewriteError(err.message)
    } finally {
      setLocalRewriteLoading(false)
    }
  }

  const applyLocalRewrite = () => {
    if (!localRewriteTarget || !localRewritePreview.trim()) return
    const replaced = replaceResumeRewriteTarget(outputText, localRewriteTarget, localRewritePreview)
    setOutputText(normalizeResumeContent(replaced, experiences))
    setResumeReview('')
    closeLocalRewrite()
  }

  const handleImproveResumeByReview = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!resumeReview.trim() || loading) return

    const previousOutput = outputText
    if (activeResumeId) setSourceResumeId(activeResumeId)
    setError('')
    setLoading(true)
    let latestGenerated = ''
    try {
      const externalContext = searchContext || await resolveSearchContext()
      const result = await runTextSkill({
        skill: resumeGenerateSkill,
        settings,
        input: {
          targetLabel,
          targetSource,
          strategyMode,
          profile,
          jdText,
          experiences,
          confirmedStrategy,
          currentResume: outputText,
          resumeReview,
          resumeSections,
          originalResume,
          searchContext: externalContext,
          task: '基于体检报告优化这版简历。输出完整新版简历Markdown，不要解释修改过程。',
        },
        onToken: value => {
          latestGenerated = value
          setOutputText(value)
        },
      })
      setOutputText(result)
      setActiveResumeId('')
      setResumeReview('')
    } catch (err) {
      setOutputText(latestGenerated.trim() || previousOutput)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }


  const handleSave = () => {
    if (!outputText.trim()) return
    const cleanedOutput = normalizeResumeContent(outputText, experiences)
    if (cleanedOutput !== outputText) setOutputText(cleanedOutput)
    const sourceResume = activeResumeId ? resumes.find(resume => resume.id === activeResumeId) : null
    const directionProfile = directionRecommendations.find(direction => direction.id === selectedDirectionId) || {
      id: selectedDirectionId || 'custom',
      name: targetLabel,
      source: targetSource,
    }
    const saved = saveResume({
      id: activeResumeId || undefined,
      title: titleInput.trim() || suggestResumeTitle(target, customTarget, jdText),
      target: targetLabel,
      jdText,
      jobId: incomingJobId || sourceResume?.jobId || undefined,
      jobTitle: incomingJob.target || sourceResume?.jobTitle || undefined,
      selectedExperienceIds: selectedIds,
      content: cleanedOutput,
      directionProfile,
      confirmedStrategy,
      strategyVersion: STRATEGY_VERSION,
      strategyMode,
      sourceResumeId: sourceResumeId || sourceResume?.sourceResumeId || undefined,
      resumeReview,
      searchContext,
      resumeSections,
      profileSnapshot: profile,
    })
    setActiveResumeId(saved.id)
    setTitleInput(saved.title)
    const nextResumes = getResumes()
    setResumes(nextResumes)
    setDetailResumeId(saved.id)
    clearDraft(DRAFT_KEYS.resume)
    setDraftUpdatedAt('')
    setRestoredDraft(false)
    setPageMode('library')
  }

  const handleOpenResume = (resume) => {
    setPageMode('editor')
    setResumeViewMode('edit')
    setActiveResumeId(resume.id)
    setTitleInput(resume.title || '')
    setTarget(targetOptions.includes(resume.target) ? resume.target : '自定义方向')
    setCustomTarget(targetOptions.includes(resume.target) ? '' : (resume.target || ''))
    setTargetSource(resume.confirmedStrategy?.target?.source || (resume.jdText ? 'jd' : 'custom'))
    setSelectedDirectionId(resume.directionProfile?.id || '')
    setJdText(resume.jdText || '')
    setSelectedIds(resume.selectedExperienceIds?.length ? resume.selectedExperienceIds : experiences.map(e => e.id))
    setResumeSections(normalizeResumeSections(resume.resumeSections))
    if (resume.profileSnapshot) setProfile(normalizeProfile(resume.profileSnapshot))
    setResumeStrategy(resume.confirmedStrategy || null)
    setConfirmedStrategy(resume.confirmedStrategy || null)
    setStrategyCollapsed(Boolean(resume.confirmedStrategy))
    setSourceResumeId(resume.sourceResumeId || '')
    setResumeReview(resume.resumeReview || '')
    setSearchContext(resume.searchContext || '')
    setOutputText(normalizeResumeContent(resume.content || '', experiences))
    setError('')
  }

  const handleDeleteResume = (id) => {
    if (!window.confirm('确认删除这个简历版本？')) return
    deleteResume(id)
    const nextResumes = getResumes()
    setResumes(nextResumes)
    if (detailResumeId === id) {
      setDetailResumeId(nextResumes[0]?.id || '')
    }
    if (activeResumeId === id) {
      setActiveResumeId('')
      setTitleInput('')
      setOutputText('')
    }
  }

  const handleNewVersion = () => {
    clearDraft(DRAFT_KEYS.resume)
    setPageMode('editor')
    setResumeViewMode('edit')
    setActiveResumeId('')
    setTitleInput('')
    setOutputText('')
    setResumeStrategy(null)
    setConfirmedStrategy(null)
    setDirectionRecommendations(directionScope === currentExperienceScope ? directionRecommendations : [])
    setSelectedDirectionId('')
    setTargetSource('custom')
    setSourceResumeId('')
    setStrategyInstruction('')
    setResumeReview('')
    setSearchContext('')
    setError('')
    setTarget('自定义方向')
    setCustomTarget('')
    setJdText('')
    setSelectedIds(experiences.map(e => e.id))
    setResumeSections(defaultResumeSections.map(section => ({ ...section })))
    setDraftUpdatedAt('')
    setRestoredDraft(false)
  }

  const handleViewResume = (resume) => {
    setPageMode('library')
    setDetailResumeId(resume.id)
    setError('')
  }

  const handleEditCurrentResume = () => {
    if (!detailResume) return
    handleOpenResume(detailResume)
  }

  const handleForkCurrentResume = () => {
    if (!detailResume) return
    handleOpenResume(detailResume)
    setActiveResumeId('')
    setSourceResumeId(detailResume.id)
    setTitleInput((detailResume.title || '简历版本') + ' 副本')
  }

  const renderStrategyWorkspace = () => {
    if (!resumeStrategy) return null
    const orderedPlan = sortStrategyPlanForDisplay(resumeStrategy.experiencePlan, experiences)

    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="prep-kicker">{strategyModeLabel}选材策略</p>
            <h2 className="mt-1 text-2xl font-black text-[#171321]">{targetLabel}</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#6f667d]">{resumeStrategy.positioning}</p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {orderedPlan.map(item => {
            const experience = experiences.find(exp => exp.id === item.experienceId)
            const enabled = item.treatment !== 'exclude'
            return (
              <div key={item.experienceId} className={`rounded-2xl border p-4 ${enabled ? 'border-[#171321]/8 bg-white/82' : 'border-[#171321]/5 bg-[#ebe7ef]/68 opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleStrategyExperience(item.experienceId)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-sm font-black leading-5 text-[#171321]">{experienceTitle(experience || {})}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        item.treatment === 'lead'
                          ? 'bg-[#171321] text-white'
                          : item.treatment === 'exclude'
                            ? 'bg-[#e1dce6] text-[#8a8296]'
                            : 'bg-[#dffbff] text-[#126274]'
                      }`}>
                        {item.treatment === 'lead' ? '主打' : item.treatment === 'include' ? '保留' : item.treatment === 'deemphasize' ? '弱化' : '排除'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#8a8296]">{item.reason}</p>
                  </div>
                </div>

                {enabled && (
                  <>
                    <label className="mt-3 block text-[11px] font-black text-[#6f667d]">当前方向下的强调角度</label>
                    <textarea
                      value={item.angle}
                      onChange={event => updateStrategyItem(item.experienceId, { angle: event.target.value })}
                      rows={3}
                      className="prep-input mt-1 w-full resize-none px-3 py-2 text-xs leading-5"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#8a8296]">Bullet 数量</span>
                      <select
                        value={item.bulletCount}
                        onChange={event => updateStrategyItem(item.experienceId, { bulletCount: Number(event.target.value) })}
                        className="prep-input min-h-[30px] w-16 px-2 text-xs"
                      >
                        {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}</option>)}
                      </select>
                      <div className="flex-1" />
                      <span className="text-[10px] font-semibold text-[#8a8296]">栏目内固定按时间倒序</span>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {resumeStrategy.evidenceGaps?.length > 0 && (
          <div className="mt-4 rounded-2xl bg-[#fff6c9]/80 p-4">
            <p className="text-xs font-black text-[#7a5400]">素材缺口</p>
            <div className="mt-2 grid gap-1 md:grid-cols-2">
              {resumeStrategy.evidenceGaps.map(gap => <p key={gap} className="text-xs font-semibold leading-5 text-[#7a6541]">· {gap}</p>)}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-[#171321]/8 bg-white/72 p-4">
          <label className="text-xs font-black text-[#171321]">继续调整策略</label>
          <textarea
            value={strategyInstruction}
            onChange={event => setStrategyInstruction(event.target.value)}
            rows={2}
            className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
            placeholder="例如：更保守一点，弱化运营经历；更突出客户方案和交付能力"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {['更保守', '更突出数据', '更贴近JD', '弱化不相关经历'].map(item => (
              <button
                key={item}
                onClick={() => setStrategyInstruction(text => text ? text + '，' + item : item)}
                className="prep-chip bg-white"
              >
                {item}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={handleRefineStrategy}
              disabled={!strategyInstruction.trim() || analysisLoading}
              className="prep-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {analysisLoading ? '优化中…' : '让 AI 调整策略'}
            </button>
            {outputText && (
              <button
                onClick={handleConfirmAndGenerate}
                disabled={!strategyIsValid || loading || analysisLoading}
                className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? '正在重新生成…' : '应用调整并重新生成'}
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-xs font-semibold leading-5 text-red-500">{error}</p>}
        </div>
      </div>
    )
  }

  if (experiences.length === 0) {
    return (
      <div className="prep-bg flex h-[calc(100vh-64px)] flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="flex h-14 w-11 items-center justify-center rounded-2xl bg-[#171321] text-xs font-black text-white shadow-[6px_6px_0_rgba(255,92,200,0.22)]">CV</span>
        <div>
          <p className="font-black text-[#171321]">先有经历资产，再生成简历版本</p>
          <p className="prep-muted mt-1 text-sm">简历版本会从经历资产里选择素材组合出来，不建议凭空生成。</p>
        </div>
      </div>
    )
  }

  if (pageMode === 'library' && resumes.length > 0) {
    const current = detailResume || resumes[0]
    const currentProfile = current.profileSnapshot || profile
    const currentContent = current.content || ''
    const currentTitle = current.title || '未命名简历版本'
    return (
      <div className="prep-bg mx-auto flex h-[calc(100vh-64px)] w-full max-w-[1180px] overflow-hidden max-lg:h-auto max-lg:flex-col max-lg:overflow-auto">
        <aside className="prep-scroll w-[360px] shrink-0 overflow-y-auto border-r border-white/70 bg-white/48 backdrop-blur-xl max-lg:w-full max-lg:border-b max-lg:border-r-0">
          <div className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="prep-kicker">投递准备</p>
                <h1 className="prep-title mt-1 text-2xl">简历页</h1>
                <p className="prep-muted mt-1 text-xs">管理已保存的简历版本</p>
              </div>
              <button onClick={handleNewVersion} className="prep-primary">
                生成新版
              </button>
            </div>
          </div>

          <div className="space-y-3 px-5 pb-5">
            <section className="prep-panel-tight border-[#b6ffdd]/70 bg-[#ecfff5]/76 p-4">
              <p className="text-sm font-black text-[#171321]">已保存 {resumes.length} 个版本</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#6f667d]">
                保存后的简历会留在这里。可以直接改当前版本，也可以基于某版生成新的投递版本。
              </p>
            </section>

            <section className="prep-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="prep-kicker">版本列表</p>
                <span className="prep-chip">{resumes.length}</span>
              </div>
              <div className="space-y-2">
                {resumes.map(resume => (
                  <ResumeVersionCard
                    key={resume.id}
                    resume={resume}
                    active={resume.id === current.id}
                    onOpen={handleViewResume}
                    onDelete={handleDeleteResume}
                  />
                ))}
              </div>
            </section>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-white/68 backdrop-blur max-lg:min-h-[760px]">
          <div className="border-b border-white/70 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-black text-[#171321]">{current.title || '未命名简历版本'}</h2>
                <p className="mt-1 text-xs font-semibold text-[#8a8296]">
                  {current.target || '未设置目标'} · 更新于 {formatDate(current.updatedAt)}
                </p>
                {error && <p className="mt-1 text-xs font-semibold leading-5 text-red-500">{error}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleEditCurrentResume} className="prep-secondary">
                  编辑
                </button>
                <ExportMenu
                  onWord={() => downloadResumeWord({ title: currentTitle, content: currentContent, profile: currentProfile })}
                  onPdf={() => downloadResumePdf({ title: currentTitle, content: currentContent, profile: currentProfile })}
                  onPng={() => {
                    setError('')
                    return downloadResumeImage({ title: currentTitle, content: currentContent, profile: currentProfile })
                      .catch(err => setError('PNG 图片导出失败：' + (err?.message || '请稍后重试')))
                  }}
                />
              </div>
            </div>
          </div>

          <section className="relative min-h-0 flex-1 overflow-auto bg-[#f1eef7]/70 p-6 max-lg:p-3">
            <iframe
              title="当前简历预览"
              className="mx-auto h-full min-h-[calc(100vh-168px)] w-full max-w-[920px] border-0"
              srcDoc={buildResumeDocumentHtml({ title: currentTitle, content: currentContent, profile: currentProfile })}
            />
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="prep-bg mx-auto flex h-[calc(100vh-64px)] w-full max-w-[1180px] overflow-hidden max-lg:h-auto max-lg:flex-col max-lg:overflow-auto">
      <aside className="prep-scroll w-[420px] shrink-0 overflow-y-auto border-r border-white/70 bg-white/48 backdrop-blur-xl max-lg:w-full max-lg:border-b max-lg:border-r-0">
        <div className="sticky top-0 z-20 border-b border-white/70 bg-white/88 px-5 py-5 backdrop-blur-xl">
          <div>
            <p className="prep-kicker">投递准备</p>
            <h1 className="prep-title mt-1 text-2xl">简历版本</h1>
          </div>
          <div className="mt-4 rounded-2xl border border-[#55dff1]/55 bg-[#dffbff]/76 p-3 shadow-[5px_5px_0_rgba(85,223,241,0.14)]">
            <p className="mb-2 text-xs font-semibold leading-5 text-[#315d66]">
              {!resumeStrategy
                ? '确认左侧信息和简历模块后，AI 会先制定选材策略。'
                : confirmedStrategyIsValid
                  ? '当前策略已经确认，可以重新生成完整简历。'
                  : '选材策略已在右侧生成，调整完成后再确认生成。'}
            </p>
            <button
              onClick={handlePrimaryResumeAction}
              disabled={primaryActionDisabled}
              className="prep-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
            >
              {primaryActionLabel}
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-semibold leading-5 text-red-500">{error}</p>}
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5">
          {hasResumeDraftWork && draftUpdatedAt && (
            <section className="prep-panel-tight order-[-2] border-[#b6ffdd]/70 bg-[#ecfff5]/80 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-[#16704a]">
                  {restoredDraft ? '已恢复上次未保存的简历稿' : '当前简历稿已自动保存'}
                  <span className="ml-1 font-semibold text-[#4f8b70]">· {formatDraftTime(draftUpdatedAt)}</span>
                </p>
                <button onClick={handleNewVersion} className="prep-ghost min-h-[28px] shrink-0 px-2">
                  放弃草稿
                </button>
              </div>
            </section>
          )}
          <section className="prep-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="prep-kicker">基础信息</label>
              <button onClick={persistProfile} className="prep-ghost min-h-[30px] px-3">
                {profileSaved ? '已保存' : '保存'}
              </button>
            </div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-[118px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#171321]/10 bg-white/72 text-xs font-bold text-[#8a8296]">
                {profile.photoDataUrl ? <img src={profile.photoDataUrl} alt="证件照" className="h-full w-full object-cover" /> : '证件照'}
              </div>
              <div className="flex flex-col gap-2">
                <label className="prep-secondary flex min-h-[34px] cursor-pointer items-center px-3">
                  上传照片
                  <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e.target.files?.[0])} />
                </label>
                {profile.photoDataUrl && (
                  <button onClick={() => updateProfile('photoDataUrl', '')} className="prep-danger">移除照片</button>
                )}
                <p className="text-xs leading-5 font-semibold text-[#8a8296]">用于正式简历模板，保存在本地浏览器。</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={profile.name} onChange={e => updateProfile('name', e.target.value)} className="prep-input px-3 py-2 text-sm" placeholder="姓名" />
              <input value={profile.city} onChange={e => updateProfile('city', e.target.value)} className="prep-input px-3 py-2 text-sm" placeholder="城市" />
              <input value={profile.phone} onChange={e => updateProfile('phone', e.target.value)} className="prep-input px-3 py-2 text-sm" placeholder="手机号" />
              <input value={profile.email} onChange={e => updateProfile('email', e.target.value)} className="prep-input px-3 py-2 text-sm" placeholder="邮箱" />
            </div>
            <textarea
              value={profile.summary}
              onChange={e => updateProfile('summary', e.target.value)}
              rows={2}
              className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
              placeholder="一句话定位，例如：有内容策略和数据分析经验的产品实习生"
            />
            <textarea
              value={educationToText(profile.education)}
              onChange={e => updateProfile('education', textToEducation(e.target.value))}
              rows={2}
              className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
              placeholder="教育背景，每行一个：学校｜学历｜专业｜时间｜补充信息"
            />
            <textarea
              value={listToText(profile.skills)}
              onChange={e => updateProfile('skills', textToList(e.target.value))}
              rows={2}
              className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
              placeholder="技能关键词，每行一个"
            />
            <textarea
              value={listToText(profile.certificates)}
              onChange={e => updateProfile('certificates', textToList(e.target.value))}
              rows={2}
              className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
              placeholder="证书 / 奖项 / 语言，每行一个"
            />
            <textarea
              value={listToText(profile.links)}
              onChange={e => updateProfile('links', textToList(e.target.value))}
              rows={2}
              className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
              placeholder="作品集 / GitHub / LinkedIn / 个人网站，每行一个"
            />
            <p className="mt-2 text-xs leading-5 font-semibold text-[#8a8296]">导入简历时会尽量自动填充；不准确可以在这里手动改。</p>
          </section>

          <section className="prep-panel p-4">
            <label className="prep-kicker mb-2 block">可选 JD / 岗位描述</label>
            <textarea
              value={jdText}
              onChange={e => {
                setJdText(e.target.value)
                setTargetSource(e.target.value.trim() ? 'jd' : (selectedDirectionId ? 'recommended' : 'custom'))
                setSearchContext('')
                resetStrategy()
              }}
              rows={5}
              className="prep-input w-full resize-none px-3 py-2 text-sm"
              placeholder="粘贴 JD 后会生成定制版；不粘贴则生成目标方向通用版。"
            />
          </section>

          <section className="prep-panel p-4">
            <div className="mb-3">
              <p className="prep-kicker">简历模块</p>
              <p className="mt-1 text-xs leading-5 font-semibold text-[#8a8296]">AI 会按这些模块智能归类经历并自检结构；拖动或用按钮调整顺序。</p>
              <p className="mt-1 text-xs leading-5 font-semibold text-[#8a8296]">
                {originalResume
                  ? `已参考原简历结构：${originalResume.sourceName || '导入简历'}`
                  : '还没有原简历结构快照；导入简历后，新版生成会更像“旧版到新版”的智能映射。'}
              </p>
            </div>
            <div className="space-y-2">
              {resumeSections.map((section, index) => (
                <div
                  key={section.id}
                  draggable
                  onDragStart={() => setDragSectionId(section.id)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={() => dropSection(section.id)}
                  onDragEnd={() => setDragSectionId('')}
                  className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 ${
                    dragSectionId === section.id ? 'border-[#55dff1] bg-[#dffbff]' : 'border-[#171321]/5 bg-white/64'
                  }`}
                >
                  <span className="cursor-grab text-xs font-black text-[#b4aebe]">::</span>
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    disabled={section.locked}
                    onChange={() => toggleSection(section.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#171321]">{section.title}</p>
                    <p className="text-[11px] font-semibold text-[#8a8296]">
                      {section.locked ? '默认保留' : section.optional ? '如果有素材再输出' : '可选模块'}
                    </p>
                  </div>
                  <button
                    onClick={() => moveSection(section.id, -1)}
                    disabled={index === 0}
                    className="prep-ghost min-h-[28px] px-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    上
                  </button>
                  <button
                    onClick={() => moveSection(section.id, 1)}
                    disabled={index === resumeSections.length - 1}
                    className="prep-ghost min-h-[28px] px-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    下
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="prep-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="prep-kicker">已保存版本</p>
              <span className="prep-chip">{resumes.length}</span>
            </div>
            {resumes.length > 0 ? (
              <div className="space-y-2">
                {resumes.map(resume => (
                  <ResumeVersionCard
                    key={resume.id}
                    resume={resume}
                    active={resume.id === activeResumeId}
                    onOpen={handleOpenResume}
                    onDelete={handleDeleteResume}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/66 px-3 py-4 text-center text-xs font-semibold text-[#8a8296]">还没有保存的简历版本</p>
            )}
          </section>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white/68 backdrop-blur max-lg:min-h-[720px]">
        <div className="border-b border-white/70 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black text-[#171321]">
                  {analysisLoading || showStrategyWorkspace
                    ? '选材策略'
                    : resumeViewMode === 'preview'
                      ? 'A4 预览'
                      : '简历内容'}
                </h2>
                {targetLabel && <span className="prep-chip prep-chip-soft">{targetLabel}</span>}
              </div>
              <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">
                {analysisLoading
                  ? `正在为“${targetLabel}”分析全部经历并制定选材策略`
                  : showStrategyWorkspace
                    ? '在右侧完成经历取舍、篇幅和表达角度调整，再从左侧顶部确认生成'
                  : loading
                  ? outputText
                    ? '正在生成简历内容，右侧会持续更新'
                    : '已开始生成，请稍等'
                  : outputText
                    ? resumeViewMode === 'preview'
                      ? '检查最终版式并选择导出格式'
                      : '直接修改经历和 bullet，内容会自动保存在本机草稿'
                    : confirmedStrategyIsValid
                      ? '选材策略已确认，可以生成完整简历'
                      : resumeStrategy
                        ? '调整并确认选材策略后生成简历'
                        : '先选择方向，再生成选材策略'}
              </p>
            </div>
            {analysisLoading && (
              <span className="prep-chip prep-chip-hit shrink-0">
                正在分析选材
              </span>
            )}
            {loading && (
              <span className="prep-chip prep-chip-warn shrink-0">
                正在生成
              </span>
            )}
            {outputText && !showStrategyWorkspace && (
              <div className="flex items-center gap-2">
                {resumeViewMode === 'preview' ? (
                  <>
                    <button onClick={() => setResumeViewMode('edit')} className="prep-secondary">
                      返回编辑
                    </button>
                    <ExportMenu
                      disabled={loading}
                      onWord={() => downloadResumeWord(exportPayload())}
                      onPdf={() => downloadResumePdf(exportPayload())}
                      onPng={() => {
                        setError('')
                        return downloadResumeImage(exportPayload())
                          .catch(err => setError('PNG 图片导出失败：' + (err?.message || '请稍后重试')))
                      }}
                    />
                  </>
                ) : (
                  <>
                    {resumeStrategy && (
                      <button
                        onClick={() => setStrategyCollapsed(false)}
                        disabled={loading}
                        className="prep-ghost"
                      >
                        调整经历
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={loading}
                      className="prep-primary"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setResumeViewMode('preview')}
                      disabled={loading}
                      className="prep-secondary"
                    >
                      A4 预览
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {outputText && !showStrategyWorkspace && resumeViewMode === 'edit' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-[#8a8296]">版本名称</span>
              <input
                value={titleInput}
                onChange={event => setTitleInput(event.target.value)}
                className="min-w-0 max-w-sm flex-1 border-0 border-b border-[#171321]/12 bg-transparent px-1 py-1 text-xs font-bold text-[#41394d] outline-none focus:border-[#725cff]"
                placeholder="未命名简历版本"
              />
            </div>
          )}
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto bg-[#f1eef7]/70">
          {analysisLoading ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center text-[#171321]">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#55dff1]/25 border-t-[#171321]" />
              <p className="mt-5 text-base font-black">正在制定选材策略</p>
              <p className="mt-2 max-w-md text-sm font-semibold leading-7 text-[#8a8296]">
                AI 正在逐条评估全部 {experiences.length} 段经历，为“{targetLabel}”判断主打内容、保留顺序和表达角度。
              </p>
            </div>
          ) : showStrategyWorkspace ? (
            renderStrategyWorkspace()
          ) : outputText ? (
            resumeViewMode === 'preview' ? (
              <iframe
                title="简历 A4 预览"
                className="h-full min-h-[1123px] w-full border-0"
                srcDoc={buildResumeDocumentHtml({ title: titleInput || '简历版本', content: outputText, profile })}
              />
            ) : (
              <>
                <ResumeContentEditor
                  value={outputText}
                  onChange={value => {
                    setOutputText(value)
                    setResumeReview('')
                  }}
                  onRewrite={openLocalRewrite}
                  profile={profile}
                />
              {loading && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl border border-white/80 bg-white/94 px-6 py-4 shadow-[0_18px_50px_rgba(62,48,86,0.18)] backdrop-blur">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#171321]/20 border-t-[#171321]" />
                  <span className="text-sm font-black text-[#171321]">正在生成简历，内容会自动更新</span>
                </div>
              )}
              </>
            )
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center text-[#171321]">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#171321]/10 border-t-[#171321]" />
              <p className="mt-5 text-base font-black">正在生成简历</p>
              <p className="mt-2 max-w-sm text-sm font-semibold leading-7 text-[#8a8296]">
                已收到你的指令，正在按经历类型、模块顺序和目标方向组织内容。生成完成后可以直接逐条修改。
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center text-[#8a8296]">
              <span className="flex h-12 w-10 items-center justify-center rounded-2xl bg-[#171321] text-[10px] font-black text-white shadow-[5px_5px_0_rgba(85,223,241,0.24)]">CV</span>
              <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7">这里会显示正式简历预览。\n\n1. 填基础信息和照片\n2. 选择目标方向或粘贴 JD\n3. 先分析简历定位\n4. 按定位生成并导出 Word / PDF / PNG</p>
            </div>
          )}
        </div>
      </main>
      {localRewriteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
          <section className="prep-panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <p className="prep-kicker">AI 局部优化</p>
              <h3 className="mt-1 text-lg font-black text-[#171321]">
                {localRewriteTarget.type === 'entry' ? localRewriteTarget.entryTitle : '当前 bullet'}
              </h3>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4">
                <label className="text-xs font-black text-[#41394d]">你想怎么改</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(localRewriteTarget.type === 'entry'
                    ? ['更贴合当前方向', '突出个人贡献', '表达更具体', '压缩篇幅']
                    : ['强化结果', '减少空话', '表达更具体', '更贴合当前方向']
                  ).map(option => (
                    <button
                      key={option}
                      onClick={() => setLocalRewriteInstruction(current => current ? `${current}，${option}` : option)}
                      className="prep-chip bg-white"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <textarea
                  value={localRewriteInstruction}
                  onChange={event => setLocalRewriteInstruction(event.target.value)}
                  rows={3}
                  className="prep-input mt-2 w-full resize-none px-3 py-2 text-sm"
                  placeholder="也可以直接写具体要求"
                />
                {localRewriteError && <p className="mt-2 text-xs font-semibold text-red-500">{localRewriteError}</p>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[#171321]/8 bg-[#f5f2f7] p-4">
                  <p className="mb-2 text-xs font-black text-[#8a8296]">原内容</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[#41394d]">{localRewriteTarget.content}</pre>
                </div>
                <div className="rounded-xl border border-[#725cff]/20 bg-white p-4">
                  <p className="mb-2 text-xs font-black text-[#725cff]">优化后</p>
                  {localRewriteLoading ? (
                    <p className="text-sm font-semibold text-[#8a8296]">正在优化…</p>
                  ) : localRewritePreview ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[#171321]">{localRewritePreview}</pre>
                  ) : (
                    <p className="text-sm font-semibold text-[#aaa3b4]">生成后会先在这里预览，不会直接覆盖。</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#171321]/10 px-5 py-4">
              <button onClick={closeLocalRewrite} disabled={localRewriteLoading} className="prep-ghost">取消</button>
              {!localRewritePreview ? (
                <button
                  onClick={handleGenerateLocalRewrite}
                  disabled={!localRewriteInstruction.trim() || !localRewriteTarget.sourceExperience || localRewriteLoading}
                  className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {localRewriteLoading ? '正在优化…' : '生成优化版本'}
                </button>
              ) : (
                <>
                  <button onClick={handleGenerateLocalRewrite} className="prep-secondary">
                    重新生成
                  </button>
                  <button onClick={applyLocalRewrite} className="prep-primary">
                    替换原内容
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
