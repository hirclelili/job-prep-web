import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel'
import OutputPanel from '../components/OutputPanel'
import { streamChat } from '../services/llm'
import { getBattlePlanSystem, getKnowledgeAppendSystem, getKnowledgeSystem } from '../prompts/battlePlan'
import { saveJob } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

const CHAT_KEY = 'battle-plan'
const INTERVIEW_OUTPUT_KEY = 'job_prep_interview_output'
const KNOWLEDGE_OUTPUT_KEY = 'job_prep_knowledge_output'
const ACTIVE_OUTPUT_KEY = 'job_prep_battle_active_output'
const CURRENT_JOB_ID_KEY = 'job_prep_current_job_id'
const CURRENT_JOB_TITLE_KEY = 'job_prep_current_job_title'
const MANUAL_COMPLETE_MARKER = '<!-- MANUAL_COMPLETE -->'

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

export default function BattlePlanPage() {
  const navigate = useNavigate()
  const { settings, isConfigured, setShowSettings, experiences } = useApp()
  const [outputText, setOutputText] = useState(() => {
    try { return localStorage.getItem(INTERVIEW_OUTPUT_KEY) || '' } catch { return '' }
  })
  const [knowledgeText, setKnowledgeText] = useState(() => {
    try { return localStorage.getItem(KNOWLEDGE_OUTPUT_KEY) || '' } catch { return '' }
  })
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState('')
  const [activeOutput, setActiveOutput] = useState(() => {
    try { return localStorage.getItem(ACTIVE_OUTPUT_KEY) || 'battle' } catch { return 'battle' }
  })
  const [currentJobId, setCurrentJobId] = useState(() => {
    try { return localStorage.getItem(CURRENT_JOB_ID_KEY) || '' } catch { return '' }
  })
  const [savedJobName, setSavedJobName] = useState(() => {
    try { return localStorage.getItem(CURRENT_JOB_TITLE_KEY) || '' } catch { return '' }
  })
  const [showSaveJob, setShowSaveJob] = useState(false)
  const [jobTitleInput, setJobTitleInput] = useState('')
  const [showAppendKnowledge, setShowAppendKnowledge] = useState(false)
  const [appendTopic, setAppendTopic] = useState('')
  const [appendFocus, setAppendFocus] = useState('')
  const [appendLoading, setAppendLoading] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)

  const systemPrompt = getBattlePlanSystem(experiences)
  const outputStage = getOutputStage(outputText)
  const manualReady = outputStage === 'manual_ready'

  useEffect(() => {
    try { localStorage.setItem(INTERVIEW_OUTPUT_KEY, outputText) } catch {}
  }, [outputText])

  useEffect(() => {
    try { localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, knowledgeText) } catch {}
  }, [knowledgeText])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_OUTPUT_KEY, activeOutput) } catch {}
  }, [activeOutput])

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

  const handleNew = () => {
    localStorage.removeItem('job_prep_chat_' + CHAT_KEY)
    localStorage.removeItem(INTERVIEW_OUTPUT_KEY)
    localStorage.removeItem(KNOWLEDGE_OUTPUT_KEY)
    localStorage.removeItem(ACTIVE_OUTPUT_KEY)
    localStorage.removeItem(CURRENT_JOB_ID_KEY)
    localStorage.removeItem(CURRENT_JOB_TITLE_KEY)
    setOutputText('')
    setKnowledgeText('')
    setKnowledgeError('')
    setKnowledgeLoading(false)
    setActiveOutput('battle')
    setCurrentJobId('')
    setSavedJobName('')
    setShowSaveJob(false)
    setJobTitleInput('')
    setShowAppendKnowledge(false)
    setAppendTopic('')
    setAppendFocus('')
    setAppendLoading(false)
    setSessionKey(k => k + 1)
  }

  const openSaveJob = () => {
    if (!manualReady && !knowledgeText.trim()) return
    setJobTitleInput(savedJobName || suggestJobTitle(outputText) || '未命名岗位')
    setShowSaveJob(true)
  }

  const handleSaveJob = () => {
    if (!jobTitleInput.trim()) return
    let chatMessages = []
    try {
      chatMessages = JSON.parse(localStorage.getItem('job_prep_chat_' + CHAT_KEY)) || []
    } catch {}
    const saved = saveJob({
      id: currentJobId || undefined,
      title: jobTitleInput.trim(),
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

    setKnowledgeText('')
    setKnowledgeError('')
    setKnowledgeLoading(true)
    setActiveOutput('knowledge')

    let full = ''
    try {
      const gen = streamChat({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        system: getKnowledgeSystem(experiences),
        messages: [{
          role: 'user',
          content: `请基于以下JD拆解/面试手册，生成独立的面试知识体系模块。\n\n${stripManualCompleteMarker(outputText)}`,
        }],
      })
      for await (const chunk of gen) {
        full += chunk
        setKnowledgeText(full)
      }
    } catch (err) {
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

    let full = ''
    try {
      const gen = streamChat({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        system: getKnowledgeAppendSystem(),
        messages: [{
          role: 'user',
          content: [
            `【要补充的模块方向】\n${appendTopic.trim()}`,
            appendFocus.trim() ? `【补充重点】\n${appendFocus.trim()}` : '',
            `【面试手册】\n${stripManualCompleteMarker(outputText)}`,
            `【现有知识体系】\n${knowledgeText}`,
          ].filter(Boolean).join('\n\n'),
        }],
      })
      for await (const chunk of gen) {
        full += chunk
      }
      setKnowledgeText(prev => appendKnowledgeModule(prev, full))
      setShowAppendKnowledge(false)
      setAppendTopic('')
      setAppendFocus('')
    } catch (err) {
      setKnowledgeError(err.message)
    } finally {
      setAppendLoading(false)
    }
  }

  const outputActions = (
    <>
      <button
        onClick={() => setActiveOutput('battle')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
          activeOutput === 'battle'
            ? 'bg-blue-600 text-white'
            : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        面试手册
      </button>
      <button
        onClick={() => setActiveOutput('knowledge')}
        disabled={!manualReady || (!knowledgeText && !knowledgeLoading && !knowledgeError)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
          activeOutput === 'knowledge'
            ? 'bg-indigo-600 text-white'
            : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        知识体系
      </button>
      <div className="flex-1" />
      <button
        onClick={openSaveJob}
        disabled={!manualReady && !knowledgeText.trim()}
        className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {currentJobId ? '更新岗位' : '保存到岗位库'}
      </button>
      <button
        onClick={handleGenerateKnowledge}
        disabled={!manualReady || knowledgeLoading}
        className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {knowledgeLoading ? '生成中…' : knowledgeText ? '重新生成知识体系' : '生成知识体系'}
      </button>
      {knowledgeText && (
        <button
          onClick={() => { setActiveOutput('knowledge'); setShowAppendKnowledge(true) }}
          disabled={appendLoading}
          className="px-3 py-1.5 rounded-lg text-xs bg-white text-indigo-600 border border-indigo-200 font-medium hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {appendLoading ? '补充中…' : '补充模块'}
        </button>
      )}
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
      ? '确认拆解无误后，在左侧回复“继续”生成完整面试手册'
      : outputStage === 'manual_generating'
        ? '正在生成完整内容，完成后可保存到岗位库或生成知识体系'
        : 'JD 拆解 · 匹配诊断 · 面试问题 · 24小时清单'

  const showOutputActions = outputText && (manualReady || knowledgeText || knowledgeLoading || knowledgeError)
  const quickActions = outputStage === 'jd_analysis'
    ? [{ label: '确认，生成面试手册', message: '继续' }]
    : []

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left: Chat */}
      <div className="w-[420px] shrink-0 flex flex-col border-r border-gray-100 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">备战面试</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {experiences.length > 0
                ? `已加载 ${experiences.length} 条经历`
                : '直接描述经历也可以'}
            </p>
          </div>
          <div className="flex gap-2">
            {experiences.length === 0 && (
              <button
                onClick={() => navigate('/experience')}
                className="px-2.5 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 border border-blue-200"
              >
                先整理经历
              </button>
            )}
            <button
              onClick={handleNew}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200"
            >
              重新开始
            </button>
          </div>
        </div>

        {/* Experience chips — shows all experiences injected into system prompt */}
        {experiences.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400 mb-1.5">
              已加载 {experiences.length} 条经历（全部注入 AI 上下文）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {experiences.map(e => (
                <span key={e.id} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">
                  {e.company || e.title}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ChatPanel
            key={sessionKey}
            storageKey={CHAT_KEY}
            systemPrompt={systemPrompt}
            onAssistantMessage={handleAssistantMessage}
            placeholder="粘贴 JD 开始分析…"
            quickActions={quickActions}
          />
        </div>
      </div>

      {/* Right: Output */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {outputTitle}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {outputSubtitle}
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <OutputPanel
            content={visibleOutput}
            emptyText={visibleEmpty}
            actions={showOutputActions ? outputActions : null}
            variant={activeOutput === 'knowledge' ? 'knowledge' : 'default'}
          />
        </div>
      </div>
      {showSaveJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{currentJobId ? '更新岗位' : '保存到岗位库'}</h2>
              <p className="text-xs text-gray-400 mt-1">确认岗位名称，之后可以在岗位库里继续查看和更新。</p>
            </div>
            <div className="px-5 py-4">
              <label className="text-xs font-medium text-gray-600 mb-2 block">岗位名称</label>
              <input
                value={jobTitleInput}
                onChange={e => setJobTitleInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="例如：字节跳动 · 商业产品运营"
                autoFocus
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowSaveJob(false)}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveJob}
                disabled={!jobTitleInput.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {showAppendKnowledge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">补充知识模块</h2>
              <p className="text-xs text-gray-400 mt-1">只会追加到知识体系，不会改动面试手册。</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">模块方向</label>
                <input
                  value={appendTopic}
                  onChange={e => setAppendTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  placeholder="例如：RAG 应用、广告投放指标、内容标签体系"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">补充重点（可选）</label>
                <textarea
                  value={appendFocus}
                  onChange={e => setAppendFocus(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  placeholder="例如：讲清楚业务场景和面试中怎么表达"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowAppendKnowledge(false)}
                disabled={appendLoading}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={handleAppendKnowledge}
                disabled={!appendTopic.trim() || appendLoading}
                className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {appendLoading ? '生成中…' : '生成补充模块'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
