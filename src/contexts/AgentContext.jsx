import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { continueAgentTurn, runAgentTurn, runApprovedAgentTool } from '../agent/runtime'
import { clearAgentThread, DEFAULT_AGENT_THREAD_ID, getAgentThread, saveAgentThread } from '../agent/memory'
import { emitAgentArtifact } from '../agent/events'
import { streamChat } from '../services/llm'
import { getSkillById } from '../skills/registry'
import { getExperiences } from '../utils/storage'
import { getJobSearchEnrichment } from '../services/search'
import { useApp } from './AppContext'

const AgentContext = createContext(null)
const skillSearchContextCache = new Map()

function compactApprovalResult(result) {
  if (!result || typeof result !== 'object') return result
  const compact = { ...result }
  for (const key of ['content', 'interviewManual', 'knowledgeSystem', 'star_story']) {
    if (typeof compact[key] === 'string' && compact[key].length > 1800) {
      compact[key] = compact[key].slice(0, 1800) + '\n\n[内容较长，已截断给 Agent 继续推理；实际保存的是完整版本。]'
    }
  }
  if (Array.isArray(compact.resume_bullets) && compact.resume_bullets.length > 8) {
    compact.resume_bullets = compact.resume_bullets.slice(0, 8)
  }
  return compact
}

function shouldPublishSkillArtifact(skillId, text) {
  if (skillId === 'experience.deep_dive.chat') {
    return text.includes('```json') || text.includes('# 完整经历档案')
  }
  if (skillId === 'battle_plan.manual.chat') {
    return text.includes('## JD 拆解') || text.includes('# 第一章') || text.includes('<!-- MANUAL_COMPLETE -->')
  }
  return false
}

export function AgentProvider({ children }) {
  const { settings, isConfigured, setShowSettings, refreshExperiences } = useApp()
  const [open, setOpen] = useState(false)
  const [currentThreadId, setCurrentThreadId] = useState(DEFAULT_AGENT_THREAD_ID)
  const [messages, setMessages] = useState(() => getAgentThread(DEFAULT_AGENT_THREAD_ID))
  const [streamingText, setStreamingText] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolEvents, setToolEvents] = useState([])
  const [pendingApproval, setPendingApproval] = useState(null)
  const [context, setContext] = useState({})
  const [draft, setDraft] = useState('')

  const switchAgentThread = useCallback((threadId = DEFAULT_AGENT_THREAD_ID, seedMessages) => {
    const safeThreadId = threadId || DEFAULT_AGENT_THREAD_ID
    setCurrentThreadId(prev => {
      if (prev === safeThreadId) return prev
      const nextMessages = Array.isArray(seedMessages) ? seedMessages : getAgentThread(safeThreadId)
      setMessages(nextMessages)
      setStreamingText('')
      setToolEvents([])
      setPendingApproval(null)
      return safeThreadId
    })
  }, [])

  const setAgentContext = useCallback((nextContext = {}) => {
    setContext(nextContext || {})
    switchAgentThread(nextContext?.agentThreadId || DEFAULT_AGENT_THREAD_ID)
  }, [switchAgentThread])

  const openAgent = useCallback((next = {}) => {
    setOpen(true)
    if (Object.prototype.hasOwnProperty.call(next, 'context')) {
      setContext(next.mergeContext ? prev => ({ ...prev, ...next.context }) : (next.context || {}))
      switchAgentThread(next.context?.agentThreadId || DEFAULT_AGENT_THREAD_ID)
    } else {
      // The floating Agent uses the global conversation, but keeps the current
      // page context so it can understand what the user is looking at.
      switchAgentThread(DEFAULT_AGENT_THREAD_ID)
    }
    if (next.draft) setDraft(next.draft)
  }, [switchAgentThread])

  const closeAgent = useCallback(() => setOpen(false), [])

  const clearAgent = useCallback(() => {
    setMessages([])
    setStreamingText('')
    setToolEvents([])
    setPendingApproval(null)
    clearAgentThread(currentThreadId)
  }, [currentThreadId])

  const restoreAgentThread = useCallback((nextMessages = [], threadId = currentThreadId) => {
    const safeThreadId = threadId || DEFAULT_AGENT_THREAD_ID
    const safeMessages = Array.isArray(nextMessages) ? nextMessages : []
    setCurrentThreadId(safeThreadId)
    setMessages(safeMessages)
    setStreamingText('')
    setToolEvents([])
    setPendingApproval(null)
    saveAgentThread(safeMessages, safeThreadId)
  }, [currentThreadId])

  const updateToolEvent = useCallback(event => {
    setToolEvents(prev => {
      const index = prev.findIndex(item => item.id === event.id)
      if (index < 0) return [...prev, event]
      const next = [...prev]
      next[index] = event
      return next
    })
  }, [])

  const sendAgentMessage = useCallback(async (text) => {
    const content = text.trim()
    if (!content || loading) return
    if (!isConfigured) {
      setShowSettings(true)
      return
    }

    const baseContext = {
      currentPath: window.location.pathname,
      ...context,
    }
    const userMessage = { role: 'user', content }
    const history = [...messages, userMessage]
    setMessages(history)
    saveAgentThread(history, currentThreadId)
    setDraft('')
    setLoading(true)
    setStreamingText('')
    setToolEvents([])
    setPendingApproval(null)

    try {
      const result = await runAgentTurn({
        userText: content,
        history: messages,
        settings,
        context: baseContext,
        refreshAppState: refreshExperiences,
        onToken: setStreamingText,
        onToolEvent: updateToolEvent,
      })
      const nextMessages = result.messages?.length
        ? result.messages
        : [...history, { role: 'assistant', content: result.text }]
      setMessages(nextMessages)
      saveAgentThread(nextMessages, currentThreadId)
      setPendingApproval(result.pendingApproval || null)
    } catch (err) {
      const nextMessages = [
        ...history,
        { role: 'assistant', content: `出错了：${err.message}\n\n可以先检查 API Key，或稍后重试。` },
      ]
      setMessages(nextMessages)
      saveAgentThread(nextMessages, currentThreadId)
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }, [context, currentThreadId, isConfigured, loading, messages, refreshExperiences, setShowSettings, settings, updateToolEvent])

  const sendSkillChatMessage = useCallback(async (text, skillId, input = {}) => {
    const content = text.trim()
    if (!content || loading) return
    if (!isConfigured) {
      setShowSettings(true)
      return
    }
    const skill = getSkillById(skillId)
    if (!skill || skill.interaction !== 'chat') {
      const nextMessages = [
        ...messages,
        { role: 'user', content },
        { role: 'assistant', content: `这个对话能力暂时不可用：${skillId}` },
      ]
      setMessages(nextMessages)
      saveAgentThread(nextMessages, currentThreadId)
      return
    }

    const baseContext = {
      currentPath: window.location.pathname,
      ...context,
      ...(input || {}),
    }
    const targetThreadId = baseContext.agentThreadId || currentThreadId
    const threadMessages = targetThreadId === currentThreadId ? messages : getAgentThread(targetThreadId)
    if (targetThreadId !== currentThreadId) {
      setCurrentThreadId(targetThreadId)
      setMessages(threadMessages)
    }
    if ((skillId === 'battle_plan.manual.chat' || skillId === 'experience.deep_dive.chat') && !baseContext.experiences) {
      baseContext.experiences = getExperiences()
    }
    const userMessage = { role: 'user', content }
    const history = [...threadMessages, userMessage]
    setMessages(history)
    saveAgentThread(history, targetThreadId)
    setDraft('')
    setLoading(true)
    setStreamingText('')
    setToolEvents([])
    setPendingApproval(null)

    try {
      if (skillId === 'battle_plan.manual.chat' && baseContext.jdText?.trim()) {
        const cacheKey = `${targetThreadId}:${baseContext.jobTitle || ''}:${baseContext.jdText.slice(0, 240)}`
        let externalContext = baseContext.searchContext || skillSearchContextCache.get(cacheKey) || ''
        if (!externalContext) {
          const enrichment = await getJobSearchEnrichment({
            purpose: 'interview',
            jobTitle: baseContext.jobTitle || '',
            jdText: baseContext.jdText,
          })
          externalContext = enrichment.contextText || ''
          if (externalContext) skillSearchContextCache.set(cacheKey, externalContext)
        }
        baseContext.searchContext = externalContext
      }
      const userSkillMessage = skill.buildUserMessage({ ...baseContext, message: content })
      const modelMessages = [
        ...threadMessages.map(message => ({ role: message.role, content: message.content })),
        ...(Array.isArray(userSkillMessage)
          ? userSkillMessage
          : [{ role: 'user', content: userSkillMessage }]),
      ]
      let full = ''
      const gen = streamChat({
        ...settings,
        system: skill.buildSystemPrompt(baseContext),
        messages: modelMessages,
      })
      for await (const chunk of gen) {
        full += chunk
        setStreamingText(full)
      }
      const nextMessages = [...history, { role: 'assistant', content: full }]
      setMessages(nextMessages)
      saveAgentThread(nextMessages, targetThreadId)

      const artifactType = baseContext.artifactTarget
      if (artifactType && shouldPublishSkillArtifact(skillId, full)) {
        emitAgentArtifact({
          type: artifactType,
          title: baseContext.artifactTitle || skill.name,
          content: full,
          source: skill.id,
          metadata: { skillId, page: baseContext.currentPath || '' },
        })
      }
    } catch (err) {
      const nextMessages = [
        ...history,
        { role: 'assistant', content: `出错了：${err.message}\n\n可以先检查 API Key，或稍后重试。` },
      ]
      setMessages(nextMessages)
      saveAgentThread(nextMessages, targetThreadId)
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }, [context, currentThreadId, isConfigured, loading, messages, setShowSettings, settings])

  const approvePendingTool = useCallback(async () => {
    if (!pendingApproval || loading) return
    if (!isConfigured) {
      setShowSettings(true)
      return
    }

    const approval = pendingApproval
    const baseContext = {
      currentPath: window.location.pathname,
      ...context,
    }
    setPendingApproval(null)
    setLoading(true)
    setStreamingText('')
    updateToolEvent({
      id: approval.id,
      tool: approval.tool,
      reason: approval.reason,
      status: 'running',
    })

    try {
      const approved = await runApprovedAgentTool({
        approval,
        settings,
        context: baseContext,
        refreshAppState: refreshExperiences,
      })
      updateToolEvent({
        id: approval.id,
        tool: approval.tool,
        reason: approval.reason,
        status: 'done',
        result: approved.result,
      })

      const internalMessages = [
        ...messages,
        {
          role: 'user',
          hidden: true,
          content: `用户已确认执行工具 ${approval.tool}。\n工具结果：\n\`\`\`json\n${JSON.stringify(compactApprovalResult(approved.result), null, 2)}\n\`\`\`\n请基于这个结果继续给用户最终回复。`,
        },
      ]
      setMessages(internalMessages)
      saveAgentThread(internalMessages, currentThreadId)

      const result = await continueAgentTurn({
        history: internalMessages,
        settings,
        context: baseContext,
        refreshAppState: refreshExperiences,
        onToken: setStreamingText,
        onToolEvent: updateToolEvent,
      })
      setMessages(result.messages)
      saveAgentThread(result.messages, currentThreadId)
      setPendingApproval(result.pendingApproval || null)
    } catch (err) {
      const nextMessages = [
        ...messages,
        { role: 'assistant', content: `执行失败：${err.message}\n\n这个操作没有完成。` },
      ]
      updateToolEvent({
        id: approval.id,
        tool: approval.tool,
        reason: approval.reason,
        status: 'error',
        error: err.message,
      })
      setMessages(nextMessages)
      saveAgentThread(nextMessages, currentThreadId)
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }, [context, currentThreadId, isConfigured, loading, messages, pendingApproval, refreshExperiences, setShowSettings, settings, updateToolEvent])

  const cancelPendingTool = useCallback(() => {
    if (!pendingApproval) return
    const nextMessages = [
      ...messages,
      { role: 'assistant', content: `已取消：${pendingApproval.label || pendingApproval.tool}。不会修改已保存的数据。` },
    ]
    updateToolEvent({
      id: pendingApproval.id,
      tool: pendingApproval.tool,
      reason: pendingApproval.reason,
      status: 'cancelled',
    })
    setPendingApproval(null)
    setMessages(nextMessages)
    saveAgentThread(nextMessages, currentThreadId)
  }, [currentThreadId, messages, pendingApproval, updateToolEvent])

  const value = useMemo(() => ({
    open,
    openAgent,
    setAgentContext,
    closeAgent,
    clearAgent,
    restoreAgentThread,
    currentThreadId,
    switchAgentThread,
    messages,
    streamingText,
    loading,
    toolEvents,
    pendingApproval,
    approvePendingTool,
    cancelPendingTool,
    sendAgentMessage,
    sendSkillChatMessage,
    draft,
    setDraft,
  }), [approvePendingTool, cancelPendingTool, clearAgent, closeAgent, currentThreadId, draft, loading, messages, open, openAgent, pendingApproval, restoreAgentThread, sendAgentMessage, sendSkillChatMessage, setAgentContext, streamingText, switchAgentThread, toolEvents])

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent() {
  return useContext(AgentContext)
}
