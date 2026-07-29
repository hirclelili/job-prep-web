import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AgentWorkspacePanel from '../components/AgentWorkspacePanel'
import OutputPanel from '../components/OutputPanel'
import {
  ExperienceDossierProgress,
  ExperienceResearchWorkspace,
} from '../components/experience/ExperienceWorkspaceUI'
import { subscribeAgentArtifacts } from '../agent/events'
import { getAgentThread, saveAgentThread } from '../agent/memory'
import { runTextSkill } from '../skills/core'
import { experienceSectionRewriteSkill } from '../skills/experienceSkills'
import { saveExperience } from '../utils/storage'
import { useApp } from '../contexts/AppContext'
import { useAgent } from '../contexts/AgentContext'
import { clearDraft, DRAFT_KEYS, formatDraftTime, readDraft, writeDraft } from '../utils/draftStorage'
import { buildExperienceResearchProgress } from '../utils/experienceResearchProgress'

const OUTPUT_STORAGE_KEY = 'job_prep_exp_output'
const ASSET_STORAGE_KEY = 'job_prep_exp_asset'
const SAVED_STORAGE_KEY = 'job_prep_exp_saved'
const CURRENT_MANUAL_SCOPE_KEY = 'job_prep_exp_current_manual_scope'

function safeScopeId(value) {
  return String(value || 'manual').replace(/[^\w:.-]/g, '_')
}

function getExperienceStorageKeys(scopeId) {
  const safeId = safeScopeId(scopeId)
  if (safeId === 'manual') {
    return {
      output: OUTPUT_STORAGE_KEY,
      asset: ASSET_STORAGE_KEY,
      saved: SAVED_STORAGE_KEY,
    }
  }
  return {
    output: `${OUTPUT_STORAGE_KEY}:${safeId}`,
    asset: `${ASSET_STORAGE_KEY}:${safeId}`,
    saved: `${SAVED_STORAGE_KEY}:${safeId}`,
  }
}

function readExperienceDraft(keys) {
  try {
    const output = localStorage.getItem(keys.output) || ''
    const asset = JSON.parse(localStorage.getItem(keys.asset) || 'null')
    return {
      output,
      asset: asset || (output ? buildFallbackExp(output) : null),
      saved: localStorage.getItem(keys.saved) === 'true',
    }
  } catch {
    return { output: '', asset: null, saved: false }
  }
}

function createManualScopeId() {
  return `manual-${Date.now()}`
}

function extractExperienceJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function sectionToMarkdown(section) {
  const prefix = section.level === 3 ? '###' : '##'
  return `${prefix} ${section.title}\n${section.content || ''}`.trim()
}

function normalizeRewriteReplacement(originalHeading, replacement) {
  const clean = replacement
    .replace(/```(?:markdown)?\n?/g, '')
    .replace(/```/g, '')
    .trim()
  const originalTitle = originalHeading.replace(/^#{1,6}\s+/, '').trim()
  const lines = clean.split('\n')
  const firstLine = lines[0]?.trim() || ''
  const firstTitle = firstLine.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim()

  if (firstTitle === originalTitle) {
    return [originalHeading, ...lines.slice(1)].join('\n').trim()
  }

  return `${originalHeading}\n${clean}`.trim()
}

function replaceExperienceSection(markdown, target, replacement) {
  const lines = markdown.split('\n')
  const result = []
  let replaced = false
  let i = 0
  const targetLevel = target.level || 2

  while (i < lines.length) {
    const line = lines[i]
    const heading = line.match(/^(#{2,3})\s+(.+)$/)
    const level = heading ? heading[1].length : 0
    const title = heading ? heading[2].trim() : ''

    if (!replaced && level === targetLevel && title === target.title) {
      result.push(normalizeRewriteReplacement(line, replacement))
      replaced = true
      i += 1
      while (i < lines.length) {
        const nextHeading = lines[i].match(/^(#{2,3})\s+(.+)$/)
        if (nextHeading && nextHeading[1].length <= targetLevel) break
        i += 1
      }
      continue
    }

    result.push(line)
    i += 1
  }

  return result.join('\n').trim()
}

function inferRewriteType(title = '') {
  if (/简历|bullet/i.test(title)) return 'resume'
  if (/故事|经历故事/i.test(title)) return 'story'
  if (/面试|开场|亮点|追问|金句/i.test(title)) return 'interview'
  return 'experience'
}

function extractReadable(text) {
  const jsonStart = text.lastIndexOf('```json')
  return jsonStart > 0 ? text.slice(0, jsonStart).trim() : text
}

function isFinalOutput(text) {
  return (
    text.includes('```json') ||
    (text.includes('## 简历条目') && text.includes('## STAR')) ||
    (text.includes('## 口述故事') && text.includes('## 核心亮点'))
  )
}

function parseBulletsFromText(text) {
  const resumeSection = (
    text.match(/##\s+第二部分[：:]\s*简历版[^\n]*\n([\s\S]*?)(?=##\s+第三部分|##\s+附录|$)/)?.[1] ||
    text.match(/##\s+第一部分[：:]\s*简历版[^\n]*\n([\s\S]*?)(?=##\s+第二部分|##\s+附录|$)/)?.[1] ||
    text.match(/##\s+简历(?:条目|版)[^\n]*\n([\s\S]*?)(?=##|$)/)?.[1] ||
    ''
  )
  const source = resumeSection || text
  return source.split('\n')
    .filter(l => l.trim().match(/^[•·-]\s+/))
    .map(l => l.trim().replace(/^[-·•]\s+/, ''))
    .filter(l => l.length > 10 && !/待补充|必须遵守|不能|禁止使用|至少/.test(l))
}

function cleanParsedField(value) {
  const clean = String(value || '')
    .replace(/^[-·•]\s*/, '')
    .replace(/\[|\]/g, '')
    .trim()
  if (!clean || /^(公司\/项目|角色|时间|经历名称|待补充|无|暂无)$/i.test(clean)) return ''
  return clean
}

function extractField(text, label) {
  const match = text.match(new RegExp(`${label}[：:]\\s*([^\\n]+)`))
  return cleanParsedField(match?.[1])
}

function extractResumeTitleParts(text) {
  const resumeSection = (
    text.match(/##\s+第二部分[：:]\s*简历版[^\n]*\n([\s\S]*?)(?=##\s+第三部分|##\s+附录|$)/)?.[1] ||
    text.match(/##\s+简历(?:条目|版)[^\n]*\n([\s\S]*?)(?=##|$)/)?.[1] ||
    text
  )
  const line = resumeSection
    .split('\n')
    .map(item => item.trim())
    .find(item => {
      if (!item || /^公司\/项目[｜|]/.test(item)) return false
      return /[｜|]/.test(item) && /\d{4}|至今|present/i.test(item)
    })
  if (!line) return {}
  const [company, role, time] = line.split(/[｜|]/).map(cleanParsedField)
  return { company, role, time }
}

function isWeakExperienceTitle(title, time = '') {
  const clean = String(title || '').trim()
  if (!clean) return true
  if (/^经历\s*·/.test(clean)) return true
  return Boolean(time && clean === time)
}

function buildExperienceTitle({ title, company, role, time }) {
  const cleanTitle = cleanParsedField(title)
  const cleanCompany = cleanParsedField(company)
  const cleanRole = cleanParsedField(role)
  const cleanTime = cleanParsedField(time)
  if (!isWeakExperienceTitle(cleanTitle, cleanTime)) return cleanTitle
  const parts = [cleanCompany, cleanRole, cleanTime].filter(Boolean)
  if (parts.length >= 2) return parts.join(' · ')
  if (parts.length === 1) return parts[0]
  return `经历 · ${new Date().toLocaleDateString('zh-CN')}`
}

function normalizeExperienceAsset(exp, text, base = {}) {
  const fromResumeLine = extractResumeTitleParts(text)
  const company = cleanParsedField(exp?.company) || fromResumeLine.company || cleanParsedField(base.company)
  const role = cleanParsedField(exp?.role) || fromResumeLine.role || cleanParsedField(base.role)
  const time = cleanParsedField(exp?.time) || fromResumeLine.time || cleanParsedField(base.time)
  const title = buildExperienceTitle({
    title: exp?.title || base.title,
    company,
    role,
    time,
  })

  return {
    ...(base || {}),
    ...(exp || {}),
    title,
    company,
    role,
    time,
  }
}

function buildFallbackExp(text, base = {}) {
  const timeMatch = text.match(/(\d{4}[.\-年]\d+)\s*[-–—~]\s*(\d{4}[.\-年]\d+|至今|present)/i)
  const fromResumeLine = extractResumeTitleParts(text)
  const company = extractField(text, '公司\\/项目') || fromResumeLine.company || cleanParsedField(base.company)
  const role = extractField(text, '角色') || fromResumeLine.role || cleanParsedField(base.role)
  const time = extractField(text, '时间') || fromResumeLine.time || cleanParsedField(base.time) || (timeMatch ? timeMatch[0] : '')
  const title = buildExperienceTitle({
    title: extractField(text, '经历名称') || base.title,
    company,
    role,
    time,
  })
  const oneLineSummary = (
    text.match(/###\s+经历总览[^\n]*\n([\s\S]*?)(?=###|##|$)/)?.[1] ||
    text.match(/主线定位[：:]\s*([^\n]+)/)?.[1] ||
    ''
  ).trim().split('\n').find(line => line.trim())?.replace(/^[-·•]\s+/, '').trim() || ''
  const fullStory = (
    text.match(/##\s+第二部分[：:]\s*完整经历故事[^\n]*\n([\s\S]*?)(?=##\s+第三部分|##\s+附录|$)/)?.[1] ||
    text.match(/##\s+第三部分[：:]\s*完整经历故事[^\n]*\n([\s\S]*?)(?=##\s+第四部分|##\s+附录|$)/)?.[1] ||
    text.match(/##\s+完整经历故事[^\n]*\n([\s\S]*?)(?=##|$)/)?.[1] ||
    ''
  ).trim()
  const opening = (
    text.match(/###\s+30\s*秒开场[^\n]*\n([\s\S]*?)(?=###|##|$)/)?.[1] ||
    text.match(/##\s+口述版本[^\n]*\n([\s\S]*?)(?=##|$)/)?.[1] ||
    ''
  ).trim()
  return {
    ...(base || {}),
    title,
    company,
    role,
    time,
    one_line_summary: oneLineSummary,
    resume_bullets: parseBulletsFromText(text),
    full_story: fullStory,
    star_story: opening || fullStory,
    interview_opening: opening,
    key_metrics: [], highlights: [], skills_demonstrated: [],
  }
}

function ExperienceGuidePanel({ archiveStatus, onOpenLibrary, researchProgress }) {
  const inProgress = archiveStatus === 'in_progress_not_saved'

  return (
    <div className="experience-guide-shared">
      <ExperienceDossierProgress
        progress={researchProgress.progress}
        fields={researchProgress.fields}
        note={researchProgress.latestField ? '刚刚确认的内容已记录' : ''}
      />
      <div className="experience-guide-next">
        <strong>{inProgress ? '继续回答左侧问题' : '先从左侧描述一段经历'}</strong>
        <p>
          {inProgress
            ? 'AI 会接着已有讨论追问，只有生成并保存完整档案后才算归档。'
            : 'AI 每轮只追问一个关键问题，并提供可点击选项。'}
        </p>
        <button onClick={onOpenLibrary} className="prep-ghost">查看经历资产</button>
      </div>
    </div>
  )
}

export default function ExperiencePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshExperiences, settings, isConfigured, setShowSettings, experiences } = useApp()
  const { restoreAgentThread, messages, currentThreadId } = useAgent()

  const prefillText = location.state?.prefillText || null
  const existingId  = location.state?.existingId  || null
  const continueResearch = Boolean(location.state?.continueResearch)
  const [manualScopeId, setManualScopeId] = useState(() => {
    try {
      const current = localStorage.getItem(CURRENT_MANUAL_SCOPE_KEY)
      if (current) return current
      const next = createManualScopeId()
      localStorage.setItem(CURRENT_MANUAL_SCOPE_KEY, next)
      return next
    } catch {
      return createManualScopeId()
    }
  })
  const experienceScopeId = existingId || manualScopeId
  const experienceThreadId = `experience:${safeScopeId(experienceScopeId)}`
  const storageKeys = getExperienceStorageKeys(experienceScopeId)
  const rewriteDraftKey = DRAFT_KEYS.experienceRewrite(experienceScopeId)
  const [initialRewriteDraft] = useState(() => readDraft(rewriteDraftKey))
  const sourceExperience = existingId
    ? experiences.find(item => item.id === existingId) || null
    : null

  // Restore output from localStorage so it survives navigation
  const [outputText, setOutputText] = useState(() => {
    return readExperienceDraft(storageKeys).output || sourceExperience?.dossier_markdown || ''
  })
  const [parsedExp, setParsedExp] = useState(() => {
    return readExperienceDraft(storageKeys).asset || sourceExperience
  })
  const [hasOutput, setHasOutput] = useState(() => {
    return Boolean(readExperienceDraft(storageKeys).output || sourceExperience?.dossier_markdown)
  })
  const [saved, setSaved] = useState(() => {
    const draft = readExperienceDraft(storageKeys)
    return draft.output ? draft.saved : Boolean(sourceExperience && sourceExperience.status !== 'imported')
  })
  const [autoPrefillMessage, setAutoPrefillMessage] = useState('')
  const [rewriteTarget, setRewriteTarget] = useState(() => initialRewriteDraft?.data?.target || null)
  const [rewriteInstruction, setRewriteInstruction] = useState(() => initialRewriteDraft?.data?.instruction || '')
  const [rewriteDraft, setRewriteDraft] = useState(() => initialRewriteDraft?.data?.preview || '')
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState(() => initialRewriteDraft?.data?.error || '')
  const [rewriteUpdatedAt, setRewriteUpdatedAt] = useState(() => initialRewriteDraft?.updatedAt || '')
  const [rewriteRestored, setRewriteRestored] = useState(() => Boolean(initialRewriteDraft?.data?.target))
  const rewriteScopeRef = useRef(rewriteDraftKey)
  const restoringRewriteRef = useRef(false)

  useEffect(() => {
    const draft = readExperienceDraft(storageKeys)
    const persistedOutput = draft.output || sourceExperience?.dossier_markdown || ''
    setOutputText(persistedOutput)
    setParsedExp(draft.asset || sourceExperience)
    setHasOutput(Boolean(persistedOutput))
    setSaved(draft.output ? draft.saved : Boolean(sourceExperience && sourceExperience.status !== 'imported'))

    const existingMessages = getAgentThread(experienceThreadId)
    restoreAgentThread(existingMessages, experienceThreadId)
    setAutoPrefillMessage(
      prefillText && (continueResearch || (existingMessages.length === 0 && !draft.output))
        ? prefillText
        : '',
    )
  }, [continueResearch, experienceThreadId, prefillText, restoreAgentThread, sourceExperience, storageKeys.asset, storageKeys.output, storageKeys.saved])

  useEffect(() => {
    if (rewriteScopeRef.current === rewriteDraftKey) return
    restoringRewriteRef.current = true
    rewriteScopeRef.current = rewriteDraftKey
    const draft = readDraft(rewriteDraftKey)
    setRewriteTarget(draft?.data?.target || null)
    setRewriteInstruction(draft?.data?.instruction || '')
    setRewriteDraft(draft?.data?.preview || '')
    setRewriteError(draft?.data?.error || '')
    setRewriteUpdatedAt(draft?.updatedAt || '')
    setRewriteRestored(Boolean(draft?.data?.target))
    setRewriteLoading(false)
  }, [rewriteDraftKey])

  useEffect(() => {
    if (restoringRewriteRef.current) {
      restoringRewriteRef.current = false
      return undefined
    }
    if (!rewriteTarget) return undefined
    const timer = window.setTimeout(() => {
      const savedDraft = writeDraft(rewriteDraftKey, {
        target: rewriteTarget,
        instruction: rewriteInstruction,
        preview: rewriteDraft,
        error: rewriteError,
      })
      if (savedDraft) setRewriteUpdatedAt(savedDraft.updatedAt)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [rewriteDraft, rewriteDraftKey, rewriteError, rewriteInstruction, rewriteTarget])

  // Persist output text across navigation
  useEffect(() => {
    if (outputText) localStorage.setItem(storageKeys.output, outputText)
  }, [outputText, storageKeys.output])

  const handleAssistantMessage = useCallback((text) => {
    if (!isFinalOutput(text)) return
    const readable = extractReadable(text)
    setOutputText(readable)
    setHasOutput(true)
    setSaved(false)   // new output → reset saved state, user must re-confirm
    localStorage.setItem(storageKeys.saved, 'false')
    const exp = extractExperienceJson(text)
    const fallback = buildFallbackExp(readable, sourceExperience)
    const nextExp = normalizeExperienceAsset({
      ...fallback,
      ...(exp || {}),
      resume_bullets: exp?.resume_bullets?.length ? exp.resume_bullets : fallback.resume_bullets,
      full_story: exp?.full_story || fallback.full_story,
      star_story: exp?.star_story || fallback.star_story,
      interview_opening: exp?.interview_opening || fallback.interview_opening,
    }, readable, sourceExperience)
    setParsedExp(nextExp)
    localStorage.setItem(storageKeys.asset, JSON.stringify(nextExp))
  }, [sourceExperience, storageKeys.asset, storageKeys.saved])

  useEffect(() => subscribeAgentArtifacts(artifact => {
    if (artifact?.type !== 'experience.output') return
    handleAssistantMessage(artifact.content || '')
  }), [handleAssistantMessage])

  const rewritePresets = ['更像简历语言', '更具体', '更口语化', '减少空话', '更突出我的贡献', '更适合面试回答']

  const openRewrite = section => {
    setRewriteTarget(section)
    setRewriteInstruction('')
    setRewriteDraft('')
    setRewriteError('')
    setRewriteRestored(false)
  }

  const cancelRewrite = () => {
    clearDraft(rewriteDraftKey)
    setRewriteTarget(null)
    setRewriteInstruction('')
    setRewriteDraft('')
    setRewriteError('')
    setRewriteUpdatedAt('')
    setRewriteRestored(false)
  }

  const handleRewriteSection = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!rewriteTarget || !rewriteInstruction.trim() || rewriteLoading) return
    setRewriteLoading(true)
    setRewriteError('')
    setRewriteDraft('')
    try {
      await runTextSkill({
        skill: experienceSectionRewriteSkill,
        settings,
        input: {
          type: inferRewriteType(rewriteTarget.title),
          title: rewriteTarget.title,
          instruction: rewriteInstruction.trim(),
          sectionMarkdown: sectionToMarkdown(rewriteTarget),
          fullDossier: outputText,
        },
        onToken: setRewriteDraft,
      })
    } catch (err) {
      setRewriteError(err.message)
    } finally {
      setRewriteLoading(false)
    }
  }

  const syncOutputDraft = nextText => {
    setOutputText(nextText)
    setHasOutput(true)
    setSaved(false)
    localStorage.setItem(storageKeys.output, nextText)
    localStorage.setItem(storageKeys.saved, 'false')
    const fallback = buildFallbackExp(nextText, sourceExperience || parsedExp)
    const nextExp = normalizeExperienceAsset({
      ...(parsedExp || {}),
      ...fallback,
      id: parsedExp?.id,
    }, nextText, sourceExperience)
    setParsedExp(nextExp)
    localStorage.setItem(storageKeys.asset, JSON.stringify(nextExp))
  }

  const applyRewrite = () => {
    if (!rewriteTarget || !rewriteDraft.trim()) return
    const nextText = replaceExperienceSection(outputText, rewriteTarget, rewriteDraft)
    syncOutputDraft(nextText)
    cancelRewrite()
  }

  const hasExperienceChatProgress = currentThreadId === experienceThreadId
    && !outputText
    && messages.some(message => !message.hidden && ['user', 'assistant'].includes(message.role))

  const archiveStatus = saved
    ? 'saved_to_library'
    : outputText
      ? 'draft_not_saved'
      : hasExperienceChatProgress
        ? 'in_progress_not_saved'
        : 'no_dossier'

  const researchProgress = useMemo(
    () => buildExperienceResearchProgress(
      currentThreadId === experienceThreadId ? messages : getAgentThread(experienceThreadId),
      sourceExperience,
      { complete: Boolean(outputText) },
    ),
    [currentThreadId, experienceThreadId, messages, outputText, sourceExperience],
  )

  const agentContext = {
    stage: '经历调研',
    agentThreadId: experienceThreadId,
    currentExperienceId: existingId || '',
    currentExperienceScope: safeScopeId(experienceScopeId),
    artifactTarget: 'experience.output',
    artifactTitle: '经历调研结果',
    preferredSkillId: 'experience.deep_dive.chat',
    pageInstruction: '用户在经历调研页。若用户描述一段经历或回答追问，优先调用 skill.chat_turn 的 experience.deep_dive.chat。skill 返回本轮问题和选项时，最终回复必须保留“## 本轮问题 / 为什么问 / 选项 / 补充提示”的结构和 A/B/C/D 选项文字，方便页面渲染可点击选项。如果输出已经是完整经历档案，发布为 experience.output。',
    currentOutputStatus: archiveStatus,
    hasChatProgress: hasExperienceChatProgress ? 'yes' : 'no',
    confirmedResearchSummary: researchProgress.summary,
    currentDossierPreview: outputText ? outputText.slice(0, 1800) : '',
    archiveStatusExplanation: archiveStatus === 'saved_to_library'
      ? '右侧完整经历档案已经保存到经历资产库。可以说已保存。'
      : archiveStatus === 'draft_not_saved'
        ? '右侧已有完整经历档案草稿，但用户还没有点击保存为经历资产。只能说已生成草稿，不能说已经归档、已保存或已进入经历资产库。'
        : archiveStatus === 'in_progress_not_saved'
          ? '右侧还没有完整经历档案，但当前对话已经有调研进度。必须接着上一轮讨论继续追问或等待用户确认生成，不能因为历史里出现过素材就直接生成完整档案。'
          : '右侧还没有完整经历档案，当前也没有可用调研进度。必须从第一轮关键问题开始，不能直接生成完整档案。',
  }

  const handleSave = () => {
    if (!parsedExp) return
    const toSave = existingId
      ? { ...parsedExp, id: existingId, status: 'optimized', dossier_markdown: outputText }
      : { ...parsedExp, status: 'optimized', dossier_markdown: outputText }
    const savedExperience = saveExperience(toSave)
    const savedThreadId = `experience:${safeScopeId(savedExperience.id)}`
    saveAgentThread(messages, savedThreadId)
    refreshExperiences()
    setSaved(true)
    localStorage.setItem(storageKeys.saved, 'true')
    navigate(`/library/${savedExperience.id}`, { replace: true })
  }

  const handleNew = () => {
    clearDraft(rewriteDraftKey)
    const nextScope = createManualScopeId()
    try { localStorage.setItem(CURRENT_MANUAL_SCOPE_KEY, nextScope) } catch {}
    setManualScopeId(nextScope)
    if (existingId) {
      navigate('/experience', { replace: true })
      restoreAgentThread([], `experience:${safeScopeId(nextScope)}`)
      setAutoPrefillMessage('')
      setOutputText('')
      setParsedExp(null)
      setHasOutput(false)
      setSaved(false)
      return
    }
    localStorage.removeItem(storageKeys.output)
    localStorage.removeItem(storageKeys.asset)
    localStorage.removeItem(storageKeys.saved)
    restoreAgentThread([], `experience:${safeScopeId(nextScope)}`)
    setAutoPrefillMessage('')
    setOutputText('')
    setParsedExp(null)
    setHasOutput(false)
    setSaved(false)
  }

  const hasDossier = Boolean(outputText)

  return (
    <>
      <ExperienceResearchWorkspace
        hasDossier={hasDossier}
        action={(
          <div className="flex shrink-0 flex-col gap-2">
            <button
              onClick={handleNew}
              className="prep-ghost"
            >
              新调研
            </button>
          </div>
        )}
        chat={(
          <AgentWorkspacePanel
            context={agentContext}
            autoSendMessage={autoPrefillMessage}
            directSkillId="experience.deep_dive.chat"
            emptyTitle="描述一段经历，助手会继续追问"
            emptyText="它会把这段经历问透，确认生成模式后，再产出经历档案底稿、简历版、完整故事和面试工具包。"
            placeholder="描述经历，或回答助手的问题…"
          />
        )}
        dossier={!hasDossier ? (
          <ExperienceGuidePanel
            archiveStatus={archiveStatus}
            researchProgress={researchProgress}
            onOpenLibrary={() => navigate('/library')}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-white/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-black text-[#171321]">经历档案</h2>
                <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">
                  {outputText
                    ? '档案底稿 · 简历版 · 完整故事 · 面试工具包'
                    : '追问完成后这里自动生成'}
                </p>
              </div>
              {hasOutput && (
                <div className="flex items-center gap-2">
                  {!saved ? (
                    <>
                      <span className="prep-chip prep-chip-warn">草稿未保存</span>
                      <button
                        onClick={handleSave}
                        className="prep-primary"
                      >
                        保存为经历资产
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="prep-chip prep-chip-hit">已保存</span>
                      <button
                        onClick={() => navigate('/library')}
                        className="prep-primary"
                      >
                        查看经历资产
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <div className="prep-panel h-full overflow-hidden">
                <OutputPanel
                  content={outputText}
                  emptyText={`调研进行中…\n\n确认生成后会产出：\n· 细致经历底稿\n· 简历版 bullet\n· 完整经历故事\n· 面试工具包`}
                  variant="experience"
                  onRewriteSection={openRewrite}
                />
              </div>
            </div>
          </>
        )}
      />
      {rewriteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="prep-panel mx-4 flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <h2 className="text-base font-black text-[#171321]">优化：{rewriteTarget.title}</h2>
              <p className="mt-1 text-xs font-semibold text-[#8a8296]">只会重写当前内容块，确认后才替换原内容；已保存的经历资产不会自动更新。</p>
              {rewriteUpdatedAt && (
                <p className="mt-1 text-xs font-bold text-[#16704a]">
                  {rewriteRestored ? '已恢复上次未完成的优化' : '优化草稿已自动保存'} · {formatDraftTime(rewriteUpdatedAt)}
                </p>
              )}
            </div>
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <label className="prep-kicker mb-2 block">优化要求</label>
              <textarea
                value={rewriteInstruction}
                onChange={e => setRewriteInstruction(e.target.value)}
                rows={3}
                className="prep-input w-full resize-none px-3 py-2 text-sm"
                placeholder="例如：第二条 bullet 更有结果感；30 秒开场更口语化；完整故事减少空话、突出关键决策"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {rewritePresets.map(preset => (
                  <button
                    key={preset}
                    onClick={() => setRewriteInstruction(text => text ? `${text}，${preset}` : preset)}
                    className="prep-chip bg-white/78"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              {rewriteError && <p className="mt-2 text-xs text-red-500">{rewriteError}</p>}
            </div>
            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
              <div className="overflow-y-auto border-r border-[#171321]/10 p-5">
                <p className="prep-kicker mb-2">原文</p>
                <div className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#41394d]">{sectionToMarkdown(rewriteTarget)}</div>
              </div>
              <div className="overflow-y-auto p-5">
                <p className="prep-kicker mb-2">优化预览</p>
                {rewriteDraft ? (
                  <div className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#41394d]">{rewriteDraft}</div>
                ) : (
                  <div className="flex h-full min-h-[220px] items-center justify-center text-sm font-semibold text-[#8a8296]">
                    输入要求后生成预览
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#171321]/10 px-5 py-4">
              <button
                onClick={cancelRewrite}
                disabled={rewriteLoading}
                className="prep-ghost disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={handleRewriteSection}
                disabled={!rewriteInstruction.trim() || rewriteLoading}
                className="prep-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {rewriteLoading ? '生成中…' : '生成预览'}
              </button>
              <button
                onClick={applyRewrite}
                disabled={!rewriteDraft.trim() || rewriteLoading}
                className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                替换原内容
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
