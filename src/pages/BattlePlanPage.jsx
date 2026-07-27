import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import AgentWorkspacePanel from '../components/AgentWorkspacePanel'
import OutputPanel from '../components/OutputPanel'
import { runTextSkill } from '../skills/core'
import { knowledgeAppendSkill, knowledgeSystemSkill, sectionRewriteSkill } from '../skills/battlePlanSkills'
import { subscribeAgentArtifacts } from '../agent/events'
import { getAgentThread } from '../agent/memory'
import { getJob, saveJob } from '../utils/storage'
import { getJobSearchEnrichment } from '../services/search'
import { useApp } from '../contexts/AppContext'
import { clearDraft, DRAFT_KEYS, formatDraftTime, readDraft, writeDraft } from '../utils/draftStorage'

const INTERVIEW_OUTPUT_KEY = 'job_prep_interview_output'
const KNOWLEDGE_OUTPUT_KEY = 'job_prep_knowledge_output'
const ACTIVE_OUTPUT_KEY = 'job_prep_battle_active_output'
const CURRENT_JOB_ID_KEY = 'job_prep_current_job_id'
const CURRENT_JOB_TITLE_KEY = 'job_prep_current_job_title'
const MANUAL_COMPLETE_MARKER = '<!-- MANUAL_COMPLETE -->'

const KNOWLEDGE_MODULE_CATALOG = [
  {
    title: '业务与用户理解',
    description: '补齐目标用户、核心痛点、业务链路和需求判断。',
    keywords: ['用户', '需求', '场景', '业务', '画像', '洞察'],
  },
  {
    title: '数据指标与分析',
    description: '补齐指标体系、分析方法和数据驱动决策。',
    keywords: ['数据', '指标', 'sql', '分析', '漏斗', '转化率', 'ctr', 'roi'],
  },
  {
    title: '实验设计与因果判断',
    description: '补齐 A/B 实验、显著性、归因和效果验证。',
    keywords: ['实验', 'a/b', 'ab测试', '显著性', '归因', '对照组'],
  },
  {
    title: 'AI 产品与大模型应用',
    description: '补齐模型能力边界、Prompt、RAG 和效果评估。',
    keywords: ['ai', '大模型', 'prompt', 'rag', 'agent', '模型', '生成'],
  },
  {
    title: '推荐系统与算法协作',
    description: '补齐召回、排序、特征、策略和算法协作方式。',
    keywords: ['推荐', '召回', '排序', '精排', '特征', '算法', '标签'],
  },
  {
    title: '商业化与增长',
    description: '补齐增长路径、商业模式、投放和变现判断。',
    keywords: ['增长', '商业化', '广告', '投放', '变现', 'cac', 'roi'],
  },
  {
    title: 'B 端产品与工作流',
    description: '补齐角色权限、流程设计、协同和系统落地。',
    keywords: ['b端', '工作流', '审批', '权限', '协同', '后台', '流程'],
  },
  {
    title: '内容治理与风险控制',
    description: '补齐审核标准、内容安全、合规和风险处置。',
    keywords: ['内容', '审核', '风控', '合规', '安全', '治理'],
  },
  {
    title: '项目推进与跨部门协作',
    description: '补齐目标拆解、优先级、协作推进和复盘方法。',
    keywords: ['项目', '协作', '推进', '上线', '优先级', '跨部门'],
  },
]

function getKnowledgeModuleRecommendations({ jdText = '', manualText = '', knowledgeText = '' }) {
  const context = `${jdText}\n${manualText}`.toLowerCase()
  const existingTitles = [...knowledgeText.matchAll(/^#\s+(.+)$/gm)]
    .map(match => match[1].replace(/^模块[一二三四五六七八九十\d]*[：:]\s*/, '').trim().toLowerCase())

  return KNOWLEDGE_MODULE_CATALOG
    .filter(module => !existingTitles.some(title => {
      const sameTitle = (
        title.includes(module.title.toLowerCase()) ||
        module.title.toLowerCase().includes(title)
      )
      const overlappingKeywords = module.keywords.filter(keyword => title.includes(keyword)).length
      return sameTitle || overlappingKeywords >= 2
    }))
    .map((module, index) => ({
      ...module,
      score: module.keywords.reduce((score, keyword) => (
        score + (context.includes(keyword) ? 2 : 0)
      ), 0) - index * 0.01,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

function stripManualCompleteMarker(text) {
  return text.replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '').trim()
}

function getOutputStage(text) {
  if (!text.trim()) return 'empty'
  if (text.includes(MANUAL_COMPLETE_MARKER)) return 'manual_ready'
  const hasFirst = text.includes('# 第一章')
  const hasSixth = text.includes('# 第六章')
  const hasSeventh = text.includes('# 第七章')
  if (!hasFirst) return 'jd_analysis'
  if (hasFirst && hasSixth && hasSeventh) return 'manual_ready'
  return 'manual_generating'
}

function isInterviewManual(text) {
  return text.includes('# 第一章') || text.includes('# 第三章') || text.includes('# 第六章')
}

function isJdAnalysis(text) {
  return (
    text.includes('JD 拆解') ||
    (text.includes('**硬技能**') && text.includes('**软技能**')) ||
    (text.includes('| ID |') && text.includes('隐含要求'))
  )
}

function isKnowledgeOutput(text) {
  return (
    text.includes('```mindmap-json') ||
    text.includes('# 模块一') ||
    text.includes('# 应用场景总览') ||
    text.includes('知识体系')
  )
}

function suggestJobTitle(text) {
  const candidates = [
    text.match(/^#{1,3}\s*JD\s*拆解\s*[·:：-]\s*(.+)$/im)?.[1],
    text.match(/^#{1,3}\s*面试手册\s*[·:：-]\s*(.+)$/im)?.[1],
    text.match(/^\*\*岗位名称\*\*\s*[：:]\s*(.+)$/im)?.[1],
    text.match(/^\*\*目标岗位\*\*\s*[：:]\s*(.+)$/im)?.[1],
  ].filter(Boolean)

  const cleaned = candidates[0]
    ?.replace(/\*\*/g, '')
    .replace(/[`#]/g, '')
    .replace(/[。.!！?？].*$/, '')
    .trim()

  return cleaned ? cleaned.slice(0, 40) : ''
}

function appendKnowledgeModule(current, addition) {
  const cleanAddition = addition.trim()
  if (!cleanAddition) return current
  const marker = '\n# 应用场景总览'
  const index = current.indexOf(marker)
  if (index >= 0) {
    return `${current.slice(0, index).trim()}\n\n---\n\n${cleanAddition}\n\n---\n${current.slice(index).trim()}`
  }
  return `${current.trim()}\n\n---\n\n${cleanAddition}`
}

function sectionToMarkdown(section) {
  return `# ${section.title}\n${section.content || ''}`.trim()
}

function normalizeRewriteReplacement(originalHeading, replacement) {
  const clean = stripManualCompleteMarker(replacement)
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

function replaceSectionByTitle(markdown, targetTitle, replacement, mode) {
  const completeMarker = markdown.includes(MANUAL_COMPLETE_MARKER) ? `\n\n${MANUAL_COMPLETE_MARKER}` : ''
  const source = stripManualCompleteMarker(markdown)
  const lines = source.split('\n')
  const result = []
  let replaced = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const isHeading = mode === 'knowledge'
      ? line.startsWith('# ') && !line.startsWith('## ')
      : (line.startsWith('# ') && !line.startsWith('## ')) || line.startsWith('## ')
    const title = isHeading ? line.replace(/^#{1,2}\s+/, '').trim() : ''

    if (!replaced && title === targetTitle) {
      result.push(normalizeRewriteReplacement(line, replacement))
      replaced = true
      i += 1
      while (i < lines.length) {
        const nextLine = lines[i]
        const isNextHeading = mode === 'knowledge'
          ? nextLine.startsWith('# ') && !nextLine.startsWith('## ')
          : (nextLine.startsWith('# ') && !nextLine.startsWith('## ')) || nextLine.startsWith('## ')
        if (isNextHeading) break
        i += 1
      }
      continue
    }

    result.push(line)
    i += 1
  }

  return `${result.join('\n').trim()}${mode === 'manual' ? completeMarker : ''}`.trim()
}

export default function BattlePlanPage() {
  const navigate = useNavigate()
  const { id: routeJobId } = useParams()
  const { settings, isConfigured, setShowSettings, experiences } = useApp()
  const initialJob = routeJobId ? getJob(routeJobId) : null
  const rewriteDraftKey = DRAFT_KEYS.interviewRewrite(routeJobId || 'draft')
  const [initialRewriteDraft] = useState(() => readDraft(rewriteDraftKey))
  const [outputText, setOutputText] = useState(() => {
    if (initialJob) return initialJob.interviewManual || ''
    try { return localStorage.getItem(INTERVIEW_OUTPUT_KEY) || '' } catch { return '' }
  })
  const [knowledgeText, setKnowledgeText] = useState(() => {
    if (initialJob) return initialJob.knowledgeSystem || ''
    try { return localStorage.getItem(KNOWLEDGE_OUTPUT_KEY) || '' } catch { return '' }
  })
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState('')
  const [activeOutput, setActiveOutput] = useState(() => {
    if (initialJob) return initialJob.activeOutput || 'battle'
    try { return localStorage.getItem(ACTIVE_OUTPUT_KEY) || 'battle' } catch { return 'battle' }
  })
  const [currentJobId, setCurrentJobId] = useState(() => {
    if (initialJob) return initialJob.id
    try { return localStorage.getItem(CURRENT_JOB_ID_KEY) || '' } catch { return '' }
  })
  const [savedJobName, setSavedJobName] = useState(() => {
    if (initialJob) return initialJob.title || ''
    try { return localStorage.getItem(CURRENT_JOB_TITLE_KEY) || '' } catch { return '' }
  })
  const [showSaveJob, setShowSaveJob] = useState(false)
  const [jobTitleInput, setJobTitleInput] = useState('')
  const [showAppendKnowledge, setShowAppendKnowledge] = useState(false)
  const [appendTopic, setAppendTopic] = useState('')
  const [appendCustomMode, setAppendCustomMode] = useState(false)
  const [appendFocus, setAppendFocus] = useState('')
  const [appendLoading, setAppendLoading] = useState(false)
  const [rewriteTarget, setRewriteTarget] = useState(() => initialRewriteDraft?.data?.target || null)
  const [rewriteInstruction, setRewriteInstruction] = useState(() => initialRewriteDraft?.data?.instruction || '')
  const [rewriteDraft, setRewriteDraft] = useState(() => initialRewriteDraft?.data?.preview || '')
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState(() => initialRewriteDraft?.data?.error || '')
  const [rewriteUpdatedAt, setRewriteUpdatedAt] = useState(() => initialRewriteDraft?.updatedAt || '')
  const [rewriteRestored, setRewriteRestored] = useState(() => Boolean(initialRewriteDraft?.data?.target))
  const rewriteScopeRef = useRef(rewriteDraftKey)
  const restoringRewriteRef = useRef(false)

  const outputStage = getOutputStage(outputText)
  const manualReady = outputStage === 'manual_ready'
  const currentJob = currentJobId ? getJob(currentJobId) : initialJob
  const jobThreadId = currentJobId ? `job:${currentJobId}` : 'job:draft'

  useEffect(() => {
    try { localStorage.setItem(INTERVIEW_OUTPUT_KEY, outputText) } catch {}
  }, [outputText])

  useEffect(() => {
    try { localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, knowledgeText) } catch {}
  }, [knowledgeText])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_OUTPUT_KEY, activeOutput) } catch {}
  }, [activeOutput])

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

  useEffect(() => {
    if (!currentJob) return
    try {
      localStorage.setItem(CURRENT_JOB_ID_KEY, currentJob.id)
      localStorage.setItem(CURRENT_JOB_TITLE_KEY, currentJob.title || '')
      localStorage.setItem(INTERVIEW_OUTPUT_KEY, outputText)
      localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, knowledgeText)
      localStorage.setItem(ACTIVE_OUTPUT_KEY, activeOutput)
    } catch {}
  }, [activeOutput, currentJob, knowledgeText, outputText])

  useEffect(() => {
    if (!currentJobId) return
    const job = getJob(currentJobId)
    if (!job) return

    const nextManual = manualReady ? stripManualCompleteMarker(outputText) : job.interviewManual || ''
    const nextKnowledge = !knowledgeLoading && knowledgeText.trim()
      ? knowledgeText
      : job.knowledgeSystem || ''
    const hasChange = (
      nextManual !== (job.interviewManual || '') ||
      nextKnowledge !== (job.knowledgeSystem || '') ||
      activeOutput !== (job.activeOutput || 'battle')
    )

    if (!hasChange) return
    saveJob({
      ...job,
      interviewManual: nextManual,
      knowledgeSystem: nextKnowledge,
      activeOutput,
      chatMessages: getAgentThread(jobThreadId),
    })
  }, [activeOutput, currentJobId, jobThreadId, knowledgeLoading, knowledgeText, manualReady, outputText])

  const handleAssistantMessage = useCallback((text) => {
    if (isInterviewManual(text) || isJdAnalysis(text)) {
      setOutputText(text)
      setActiveOutput('battle')
    } else if (isKnowledgeOutput(text) || activeOutput === 'knowledge') {
      setKnowledgeText(text)
      setKnowledgeError('')
      setActiveOutput('knowledge')
    }
  }, [activeOutput])

  const buildBattleAgentContext = () => {
    const isKnowledgeMode = activeOutput === 'knowledge'
    return {
      stage: '面试准备',
      agentThreadId: jobThreadId,
      jobId: currentJobId,
      jobTitle: savedJobName || currentJob?.title || '',
      jdText: currentJob?.jdText || '',
      artifactTarget: isKnowledgeMode ? 'knowledge.output' : 'interview.output',
      artifactTitle: isKnowledgeMode ? '知识体系' : '面试准备输出',
      preferredSkillId: isKnowledgeMode ? 'battle_plan.knowledge.generate' : 'battle_plan.manual.chat',
      pageInstruction: isKnowledgeMode
        ? '用户正在某个具体岗位的知识体系视图。当前岗位/JD 已在上下文中，先用 workspace.read 读取当前面试手册和知识体系，再按需要调用 battle_plan.knowledge.generate 或 battle_plan.knowledge.append；完整知识体系发布为 knowledge.output。'
        : '用户正在某个具体岗位的面试准备工作区。当前岗位/JD 已在上下文中；若用户要求拆解 JD 或继续生成面试手册，优先调用 skill.chat_turn 的 battle_plan.manual.chat；完整 JD 拆解或面试手册发布为 interview.output。',
      currentOutputStage: outputStage,
      manualReady,
      hasKnowledge: !!knowledgeText.trim(),
      experiencesCount: experiences.length,
    }
  }

  useEffect(() => subscribeAgentArtifacts(artifact => {
    if (artifact?.type === 'interview.output') {
      handleAssistantMessage(artifact.content || '')
    }
    if (artifact?.type === 'knowledge.output') {
      setKnowledgeText(artifact.content || '')
      setKnowledgeError('')
      setActiveOutput('knowledge')
    }
  }), [handleAssistantMessage])

  const handleNew = () => {
    clearDraft(rewriteDraftKey)
    if (currentJob) {
      saveJob({
        ...currentJob,
        interviewManual: '',
        knowledgeSystem: '',
        activeOutput: 'battle',
      })
    }
    setOutputText('')
    setKnowledgeText('')
    setKnowledgeError('')
    setKnowledgeLoading(false)
    setActiveOutput('battle')
    setCurrentJobId(routeJobId || '')
    setSavedJobName(currentJob?.title || '')
    setShowSaveJob(false)
    setJobTitleInput('')
    setShowAppendKnowledge(false)
    setAppendTopic('')
    setAppendCustomMode(false)
    setAppendFocus('')
    setAppendLoading(false)
    setRewriteTarget(null)
    setRewriteInstruction('')
    setRewriteDraft('')
    setRewriteError('')
    setRewriteLoading(false)
    setRewriteUpdatedAt('')
    setRewriteRestored(false)
  }

  const openSaveJob = () => {
    if (!manualReady && !knowledgeText.trim()) return
    setJobTitleInput(savedJobName || currentJob?.title || suggestJobTitle(outputText) || '未命名岗位')
    setShowSaveJob(true)
  }

  const handleSaveJob = () => {
    if (!jobTitleInput.trim()) return
    const chatMessages = getAgentThread(jobThreadId)
    const saved = saveJob({
      id: currentJobId || undefined,
      title: jobTitleInput.trim(),
      jdText: currentJob?.jdText || '',
      interviewManual: stripManualCompleteMarker(outputText),
      knowledgeSystem: knowledgeText,
      activeOutput,
      chatMessages,
    })
    setCurrentJobId(saved.id)
    setSavedJobName(saved.title)
    try {
      localStorage.setItem(CURRENT_JOB_ID_KEY, saved.id)
      localStorage.setItem(CURRENT_JOB_TITLE_KEY, saved.title)
    } catch {}
    setShowSaveJob(false)
  }

  const handleGenerateKnowledge = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!manualReady || knowledgeLoading) return

    const previousKnowledge = knowledgeText
    setKnowledgeText('')
    setKnowledgeError('')
    setKnowledgeLoading(true)
    setActiveOutput('knowledge')

    try {
      const enrichment = await getJobSearchEnrichment({
        purpose: 'interview',
        jobTitle: savedJobName || currentJob?.title || '',
        jdText: currentJob?.jdText || '',
      })
      await runTextSkill({
        skill: knowledgeSystemSkill,
        settings,
        input: {
          experiences,
          manualText: stripManualCompleteMarker(outputText),
          searchContext: enrichment.contextText || '',
        },
        onToken: setKnowledgeText,
      })
    } catch (err) {
      setKnowledgeText(previousKnowledge)
      setKnowledgeError(err.message)
    } finally {
      setKnowledgeLoading(false)
    }
  }


  const handleAppendKnowledge = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!knowledgeText.trim() || !appendTopic.trim() || appendLoading) return

    setAppendLoading(true)
    setKnowledgeError('')
    setActiveOutput('knowledge')

    let addition = ''
    try {
      addition = await runTextSkill({
        skill: knowledgeAppendSkill,
        settings,
        input: {
          topic: appendTopic.trim(),
          focus: appendFocus.trim(),
          manualText: stripManualCompleteMarker(outputText),
          knowledgeText,
        },
      })
      setKnowledgeText(prev => appendKnowledgeModule(prev, addition))
      setShowAppendKnowledge(false)
      setAppendTopic('')
      setAppendCustomMode(false)
      setAppendFocus('')
    } catch (err) {
      setKnowledgeError(err.message)
    } finally {
      setAppendLoading(false)
    }
  }

  const openAppendKnowledge = () => {
    setActiveOutput('knowledge')
    setAppendTopic('')
    setAppendCustomMode(false)
    setAppendFocus('')
    setShowAppendKnowledge(true)
  }


  const openRewrite = (section) => {
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
        skill: sectionRewriteSkill,
        settings,
        input: {
          type: rewriteTarget.type,
          instruction: rewriteInstruction.trim(),
          title: rewriteTarget.title,
          sectionMarkdown: sectionToMarkdown(rewriteTarget),
          manualText: stripManualCompleteMarker(outputText),
          knowledgeText,
        },
        onToken: setRewriteDraft,
      })
    } catch (err) {
      setRewriteError(err.message)
    } finally {
      setRewriteLoading(false)
    }
  }


  const applyRewrite = () => {
    if (!rewriteTarget || !rewriteDraft.trim()) return
    if (rewriteTarget.type === 'manual') {
      setOutputText(prev => replaceSectionByTitle(prev, rewriteTarget.title, rewriteDraft, 'manual'))
      setActiveOutput('battle')
    } else {
      setKnowledgeText(prev => replaceSectionByTitle(prev, rewriteTarget.title, rewriteDraft, 'knowledge'))
      setActiveOutput('knowledge')
    }
    cancelRewrite()
  }

  const outputActions = (
    <>
      <button
        onClick={() => setActiveOutput('battle')}
        className={`prep-ghost ${
          activeOutput === 'battle'
            ? 'bg-[#171321] text-white'
            : ''
        }`}
      >
        面试手册
      </button>
      <button
        onClick={() => setActiveOutput('knowledge')}
        disabled={!manualReady || (!knowledgeText && !knowledgeLoading && !knowledgeError)}
        className={`prep-ghost disabled:cursor-not-allowed disabled:opacity-40 ${
          activeOutput === 'knowledge'
            ? 'bg-[#171321] text-white'
            : ''
        }`}
      >
        知识体系
      </button>
      <div className="flex-1" />
      <button
        onClick={openSaveJob}
        disabled={!manualReady && !knowledgeText.trim()}
        className="prep-ghost disabled:cursor-not-allowed disabled:opacity-40"
      >
        {currentJobId ? '更新岗位' : '保存为岗位'}
      </button>
    </>
  )

  const visibleOutput = activeOutput === 'knowledge'
    ? (knowledgeError ? `# 知识体系生成失败\n${knowledgeError}` : knowledgeText)
    : stripManualCompleteMarker(outputText)

  const visibleEmpty = activeOutput === 'knowledge'
    ? '点击“生成知识体系”，这里会单独生成知识地图、核心概念和应用场景说明'
    : '粘贴 JD 并确认拆解后，这里会生成完整的面试手册'

  const outputTitle = activeOutput === 'knowledge'
    ? '知识体系'
    : outputStage === 'jd_analysis'
      ? 'JD 拆解'
      : outputStage === 'manual_generating'
        ? '面试手册生成中'
        : '面试手册'

  const outputSubtitle = activeOutput === 'knowledge'
    ? '知识地图 · 核心概念 · 应用场景'
    : outputStage === 'jd_analysis'
      ? '确认拆解无误后，点击左侧“继续，生成面试手册”'
      : outputStage === 'manual_generating'
        ? '正在生成完整内容，完成后可保存到岗位库或生成知识体系'
        : 'JD 拆解 · 匹配诊断 · 面试问题 · 24小时清单'

  const showOutputActions = outputText && (manualReady || knowledgeText || knowledgeLoading || knowledgeError)
  const quickActions = outputStage === 'jd_analysis'
    ? [{ label: '继续，生成面试手册', message: '继续' }]
    : []
  const autoPrepareMessage = currentJob?.jdText && !outputText.trim()
    ? '请拆解当前岗位 JD，先输出 JD 拆解并等我确认。'
    : ''
  const rewritePresets = ['更具体', '更口语化', '更贴合我的经历', '更适合面试回答']
  const knowledgeRecommendations = getKnowledgeModuleRecommendations({
    jdText: currentJob?.jdText || '',
    manualText: outputText,
    knowledgeText,
  })

  if (routeJobId && !initialJob) {
    return (
      <div className="prep-bg flex h-[calc(100vh-64px)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm font-black text-[#171321]">没有找到这个岗位</p>
        <button
          onClick={() => navigate('/jobs')}
          className="prep-primary"
        >
          返回岗位库
        </button>
      </div>
    )
  }

  if (!routeJobId) {
    return <Navigate to="/interviews" replace />
  }

  return (
    <div className="prep-bg mx-auto flex h-[calc(100vh-64px)] w-full max-w-[1180px] overflow-hidden max-lg:h-auto max-lg:flex-col max-lg:overflow-auto">
      {/* Left: Chat */}
      <div className="flex w-[430px] shrink-0 flex-col border-r border-white/70 bg-white/50 backdrop-blur-xl max-lg:w-full max-lg:border-b max-lg:border-r-0">
        <div className="flex items-start justify-between gap-4 border-b border-white/70 px-5 py-4">
          <div>
            <button
              onClick={() => navigate('/interviews')}
              className="prep-ghost mb-2 min-h-[30px]"
            >
              面试准备
            </button>
            <h2 className="prep-title max-w-[270px] truncate text-xl">{savedJobName || currentJob?.title || '未命名岗位'}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#8a8296]">
              {currentJob?.jdText
                ? `已绑定 JD · 已加载 ${experiences.length} 条经历资产`
                : `这个岗位还没有 JD · 已加载 ${experiences.length} 条经历资产`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {experiences.length === 0 && (
              <button
                onClick={() => navigate('/experience')}
                className="prep-secondary"
              >
                先做经历调研
              </button>
            )}
            <button
              onClick={handleNew}
              className="prep-ghost"
            >
              清空本岗位材料
            </button>
          </div>
        </div>

        {/* Experience chips — shows all experiences injected into system prompt */}
        {experiences.length > 0 && (
          <div className="border-b border-white/70 px-5 py-3">
            <p className="mb-1.5 text-xs font-semibold text-[#8a8296]">
              已加载 {experiences.length} 条经历资产（全部注入 AI 上下文）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {experiences.map(e => (
                <span key={e.id} className="prep-chip prep-chip-soft">
                  {e.company || e.title}
                </span>
              ))}
            </div>
          </div>
        )}
        {currentJob?.jdText && (
          <div className="border-b border-white/70 px-5 py-3">
            <p className="prep-kicker mb-1.5">当前岗位 JD</p>
            <div className="max-h-28 overflow-y-auto rounded-2xl bg-white/68 px-3 py-2 text-xs font-semibold leading-5 text-[#6f667d]">
              {currentJob.jdText}
            </div>
          </div>
        )}
        <div className="border-b border-white/70 px-5 py-3">
          <p className="prep-kicker mb-2">材料操作</p>
          {!isConfigured && (
            <div className="mb-2 rounded-2xl border border-[#ffb86b]/45 bg-[#fff4df]/78 px-3 py-2">
              <p className="text-xs font-black text-[#9a5a00]">需要先设置 API Key</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#8a8296]">
                设置完成后，这个岗位会自动继续拆解 JD。
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <button
              onClick={handleGenerateKnowledge}
              disabled={!manualReady || knowledgeLoading}
              className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {knowledgeLoading ? '生成中...' : knowledgeText ? '重新生成知识体系' : '生成知识体系'}
            </button>
            <button
              onClick={openAppendKnowledge}
              disabled={!knowledgeText || appendLoading}
              className="prep-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {appendLoading ? '补充中...' : '补充知识模块'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentWorkspacePanel
            context={buildBattleAgentContext()}
            directSkillId="battle_plan.manual.chat"
            placeholder={currentJob?.jdText ? '围绕当前岗位继续准备…' : '补充这个岗位的 JD 或面试准备要求…'}
            quickActions={quickActions}
            autoSendMessage={autoPrepareMessage}
            emptyTitle={currentJob?.jdText ? '先拆解这个岗位 JD' : '这个岗位还缺 JD'}
            emptyText={currentJob?.jdText
              ? '助手会读取当前岗位 JD 和经历资产，必要时搜索公司和岗位信息，再把面试材料回写到右侧。'
              : '返回岗位库补充 JD 后，再进入这个岗位的面试准备会更稳。'}
          />
        </div>
      </div>

      {/* Right: Output */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white/68 backdrop-blur max-lg:min-h-[720px]">
        <div className="border-b border-white/70 px-5 py-4">
          <h2 className="text-sm font-black text-[#171321]">
            {outputTitle}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">
            {outputSubtitle}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="prep-panel h-full overflow-hidden">
          <OutputPanel
            content={visibleOutput}
            emptyText={visibleEmpty}
            actions={showOutputActions ? outputActions : null}
            variant={activeOutput === 'knowledge' ? 'knowledge' : 'default'}
            onRewriteSection={manualReady || activeOutput === 'knowledge' ? openRewrite : null}
          />
          </div>
        </div>
      </div>
      {showSaveJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="prep-panel mx-4 w-full max-w-sm overflow-hidden">
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <h2 className="text-base font-black text-[#171321]">{currentJobId ? '更新岗位' : '保存为岗位'}</h2>
              <p className="mt-1 text-xs font-semibold text-[#8a8296]">确认岗位名称，之后可以在岗位库里继续查看和更新。</p>
            </div>
            <div className="px-5 py-4">
              <label className="prep-kicker mb-2 block">岗位名称</label>
              <input
                value={jobTitleInput}
                onChange={e => setJobTitleInput(e.target.value)}
                className="prep-input w-full px-3 py-2 text-sm"
                placeholder="例如：字节跳动 · 商业产品运营"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[#171321]/10 px-5 py-4">
              <button
                onClick={() => setShowSaveJob(false)}
                className="prep-ghost"
              >
                取消
              </button>
              <button
                onClick={handleSaveJob}
                disabled={!jobTitleInput.trim()}
                className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {showAppendKnowledge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="prep-panel mx-4 w-full max-w-md overflow-hidden">
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <h2 className="text-base font-black text-[#171321]">补充知识模块</h2>
              <p className="mt-1 text-xs font-semibold text-[#8a8296]">选择一个推荐模块，或自定义要补充的方向。每次只追加一个模块。</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="prep-kicker mb-2 block">推荐补充</label>
                <div className="grid gap-2">
                  {knowledgeRecommendations.map(module => {
                    const selected = !appendCustomMode && appendTopic === module.title
                    return (
                      <button
                        key={module.title}
                        type="button"
                        onClick={() => {
                          setAppendCustomMode(false)
                          setAppendTopic(module.title)
                        }}
                        className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                          selected
                            ? 'border-[#171321] bg-[#171321] text-white shadow-[4px_4px_0_rgba(85,223,241,0.32)]'
                            : 'border-[#171321]/10 bg-white/72 text-[#171321] hover:border-[#171321]/30 hover:bg-white'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-[#55dff1] bg-[#55dff1]' : 'border-[#8a8296]/50'
                        }`}>
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-[#171321]" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black">{module.title}</span>
                          <span className={`mt-0.5 block text-xs font-semibold leading-5 ${
                            selected ? 'text-white/70' : 'text-[#8a8296]'
                          }`}>
                            {module.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setAppendCustomMode(true)
                      setAppendTopic('')
                    }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl border px-3 text-left text-sm font-black transition ${
                      appendCustomMode
                        ? 'border-[#171321] bg-[#171321] text-white'
                        : 'border-dashed border-[#171321]/25 bg-white/50 text-[#171321] hover:border-[#171321]/50'
                    }`}
                  >
                    <span className="text-lg leading-none">+</span>
                    自定义模块
                  </button>
                </div>
              </div>
              {appendCustomMode && (
                <div>
                  <label className="prep-kicker mb-2 block">自定义模块方向</label>
                  <input
                    value={appendTopic}
                    onChange={e => setAppendTopic(e.target.value)}
                    className="prep-input w-full px-3 py-2 text-sm"
                    placeholder="例如：RAG 应用、广告投放指标、内容标签体系"
                    autoFocus
                  />
                </div>
              )}
              {appendTopic && (
                <div className="rounded-2xl bg-[#eefcff]/80 px-3 py-2 text-xs font-bold text-[#315d66]">
                  将补充：{appendTopic}
                </div>
              )}
              <div>
                <label className="prep-kicker mb-2 block">希望重点讲什么（可选）</label>
                <textarea
                  value={appendFocus}
                  onChange={e => setAppendFocus(e.target.value)}
                  rows={3}
                  className="prep-input w-full resize-none px-3 py-2 text-sm"
                  placeholder="例如：多讲真实业务场景，以及面试时应该如何判断和表达"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#171321]/10 px-5 py-4">
              <button
                onClick={() => setShowAppendKnowledge(false)}
                disabled={appendLoading}
                className="prep-ghost disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={handleAppendKnowledge}
                disabled={!appendTopic.trim() || appendLoading}
                className="prep-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {appendLoading ? '生成中…' : '生成补充模块'}
              </button>
            </div>
          </div>
        </div>
      )}
      {rewriteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="prep-panel mx-4 flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
            <div className="border-b border-[#171321]/10 px-5 py-4">
              <h2 className="text-base font-black text-[#171321]">优化：{rewriteTarget.title}</h2>
              <p className="mt-1 text-xs font-semibold text-[#8a8296]">只会重写当前{rewriteTarget.type === 'manual' ? '章节' : '模块'}，确认后才替换原内容。</p>
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
                placeholder="例如：更具体一点，回答更口语化，并且更多结合我的经历"
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
              {rewriteError && <p className="text-xs text-red-500 mt-2">{rewriteError}</p>}
            </div>
            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
              <div className="overflow-y-auto border-r border-[#171321]/10 p-5">
                <p className="prep-kicker mb-2">原文</p>
                <div className="prose text-sm max-w-none whitespace-pre-wrap">{sectionToMarkdown(rewriteTarget)}</div>
              </div>
              <div className="overflow-y-auto p-5">
                <p className="prep-kicker mb-2">优化预览</p>
                {rewriteDraft ? (
                  <div className="prose text-sm max-w-none whitespace-pre-wrap">{rewriteDraft}</div>
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
    </div>
  )
}
