import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripAgentToolBlocks } from '../agent/runtime'
import { useAgent } from '../contexts/AgentContext'
import { ExperienceChoiceCards } from './experience/ExperienceWorkspaceUI'

const TOOL_LABELS = {
  'memory.read': '读取记忆',
  'memory.save_note': '保存记忆',
  'memory.update': '更新记忆',
  'profile.read': '读取基本信息',
  'profile.update': '更新基本信息',
  'workspace.read': '读取当前草稿',
  'artifact.publish': '回写结果',
  'experiences.read': '读取经历资产',
  'experiences.save': '保存经历资产',
  'resumes.read': '读取简历版本',
  'resumes.save': '保存简历版本',
  'jobs.read': '读取岗位库',
  'jobs.save': '保存岗位',
  'skill.catalog': '查看能力列表',
  'skill.run': '调用专业技能',
  'skill.chat_turn': '调用对话技能',
}

function toolStatus(event) {
  if (event.status === 'running') return '执行中'
  if (event.status === 'approval') return '待确认'
  if (event.status === 'cancelled') return '已取消'
  if (event.status === 'error') return '失败'
  if (event.result?.published) return '已回写'
  return '完成'
}

function cleanOptionText(text = '') {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanAssistantDisplay(text = '') {
  return stripAgentToolBlocks(text)
    .replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '')
    .trim()
}

function parseChoiceLine(line = '') {
  const cleaned = line
    .trim()
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^\*\*\s*/, '')
    .replace(/\s*\*\*$/, '')
    .trim()
  const parsed = cleaned.match(/^(?:\*\*)?([A-H])\s*[.．、):：]\s*(?:\*\*)?\s*(.+)$/i)
  if (!parsed) return null
  const label = parsed[1].toUpperCase()
  const text = cleanOptionText(parsed[2])
  if (!text) return null
  return { label, text, message: `${label}. ${text}` }
}

function parseInlineChoices(text = '') {
  const options = []
  const source = String(text || '').trim()
  if (!source) return options
  const re = /(?:^|\s)([A-H])(?:\s*[.．、):：]\s*|\s+|(?=[\u4e00-\u9fa5]))([\s\S]*?)(?=\s+[A-H](?:\s*[.．、):：]|\s+|(?=[\u4e00-\u9fa5]))|$)/gi
  let match
  while ((match = re.exec(source))) {
    const label = match[1].toUpperCase()
    const text = cleanOptionText(match[2])
    if (text) options.push({ label, text, message: `${label}. ${text}` })
  }
  return options
}

function isCustomChoice(option) {
  return /(其他|自己补充|自行补充|我来补充|我补充|补充\/修正|补充信息|真实情况)/.test(option?.text || '')
}

function splitChoiceContent(content = '') {
  const lines = String(content || '').split('\n')
  const options = []
  const body = []
  let inOptions = false
  let skippedInstruction = false
  let multiple = /多选|可多选|可以多选|选择多个|选多个|同时选择|可同时/.test(content)

  for (const line of lines) {
    const trimmed = line.trim()
    const optionHeading = trimmed.match(/^选项(?:（[^）]*）|\([^)]*\))?[：:]?\s*(.*)$/)
    if (optionHeading) {
      inOptions = true
      if (/多选|可多选|可以多选|选择多个|选多个|同时选择|可同时/.test(trimmed)) multiple = true
      const inlineOptions = parseInlineChoices(optionHeading[1])
      if (inlineOptions.length > 0) options.push(...inlineOptions)
      continue
    }

    if (inOptions) {
      const option = parseChoiceLine(line)
      if (option) {
        options.push(option)
        continue
      }
      const inlineOptions = parseInlineChoices(line)
      if (inlineOptions.length > 1) {
        options.push(...inlineOptions)
        continue
      }
      if (!trimmed) continue
      if (/^(补充提示|请直接回复|如果以上|如果都不准|你可以直接)/.test(trimmed)) {
        skippedInstruction = true
        continue
      }
      if (/^#{1,6}\s+/.test(trimmed) || trimmed.startsWith('```')) {
        inOptions = false
        body.push(line)
        continue
      }
      if (skippedInstruction) continue
    }

    body.push(line)
  }

  return {
    body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    options,
    multiple,
  }
}

export default function AgentWorkspacePanel({
  context,
  placeholder = '输入你的需求…',
  emptyTitle = '和求职助手对话',
  emptyText = '它会根据当前页面自动读取资料、调用能力，并把完整结果回写到右侧。',
  quickActions = [],
  autoSendMessage,
  directSkillId = '',
}) {
  const {
    messages,
    streamingText,
    loading,
    toolEvents,
    pendingApproval,
    approvePendingTool,
    cancelPendingTool,
    sendAgentMessage,
    sendSkillChatMessage,
    setAgentContext,
    clearAgent,
  } = useAgent()
  const [input, setInput] = useState('')
  const [customChoice, setCustomChoice] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const autoSentKeyRef = useRef('')
  const contextKey = JSON.stringify(context || {})

  useEffect(() => {
    setAgentContext(context || {})
  }, [contextKey, setAgentContext])

  useEffect(() => {
    const autoKey = `${context?.agentThreadId || ''}:${autoSendMessage || ''}`
    if (autoSendMessage && autoSentKeyRef.current !== autoKey) {
      autoSentKeyRef.current = autoKey
      if (directSkillId) {
        sendSkillChatMessage(autoSendMessage, directSkillId, context || {})
      } else {
        sendAgentMessage(autoSendMessage)
      }
    }
  }, [autoSendMessage, contextKey, directSkillId, sendAgentMessage, sendSkillChatMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolEvents])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [input])

  const submit = (text = input, options = {}) => {
    const value = text.trim()
    if (!value || loading) return
    const shouldUseCustomChoice = options.useCustom !== false
    const payload = shouldUseCustomChoice && customChoice
      ? `我选择了 ${customChoice.label}，补充真实情况：${value}`
      : value
    if (directSkillId) {
      sendSkillChatMessage(payload, directSkillId, context || {})
    } else {
      sendAgentMessage(payload)
    }
    setInput('')
    if (shouldUseCustomChoice) setCustomChoice(null)
  }

  const handleChoiceSelect = option => {
    if (isCustomChoice(option)) {
      setCustomChoice(option)
      setInput('')
      requestAnimationFrame(() => textareaRef.current?.focus())
      return
    }
    setCustomChoice(null)
    submit(option.message, { useCustom: false })
  }

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <div className="prep-panel-tight flex h-full flex-col justify-center px-5 py-8 text-center">
            <p className="text-sm font-black text-[#171321]">{emptyTitle}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-[#8a8296]">{emptyText}</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.filter(message => !message.hidden).map((message, index) => (
            <AgentWorkspaceMessage
              key={`${message.role}-${index}`}
              message={message}
              onChoiceSelect={handleChoiceSelect}
            />
          ))}
        </div>

        {pendingApproval && (
          <div className="mt-4 rounded-2xl border border-[#fff04a]/70 bg-[#fff9b7]/70 px-4 py-3">
            <p className="text-xs font-black text-[#9a5a00]">需要确认后执行</p>
            <p className="mt-1 text-sm font-black text-[#171321]">{pendingApproval.label || pendingApproval.tool}</p>
            {pendingApproval.reason && (
              <p className="mt-1 text-xs font-semibold leading-5 text-[#6f667d]">{pendingApproval.reason}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={approvePendingTool}
                disabled={loading}
                className="prep-primary"
              >
                确认执行
              </button>
              <button
                onClick={cancelPendingTool}
                disabled={loading}
                className="prep-ghost"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {toolEvents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {toolEvents.map(event => (
              <span key={event.id} className={`prep-chip ${
                event.status === 'error'
                  ? 'bg-red-50 text-red-500'
                  : 'prep-chip-soft'
              }`}>
                {(TOOL_LABELS[event.tool] || event.tool) + ' · ' + toolStatus(event)}
              </span>
            ))}
          </div>
        )}

        {loading && (
          <div className="mt-4 rounded-2xl border border-[#55dff1]/40 bg-[#dffbff]/70 px-3 py-2 text-sm leading-6 text-[#41394d]">
            {streamingText ? (
              <div className="prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanAssistantDisplay(streamingText)}</ReactMarkdown>
              </div>
            ) : (
              <span className="text-xs font-semibold text-[#8a8296]">正在读取当前状态…</span>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/70 bg-white/42 px-4 pb-4 pt-3">
        {customChoice && (
          <div className="mb-2 flex items-center justify-between rounded-2xl border border-[#ff5cc8]/25 bg-[#fff0fa]/70 px-3 py-2">
            <span className="text-xs font-bold text-[#6f667d]">
              正在补充：{customChoice.label}. {customChoice.text}
            </span>
            <button
              onClick={() => setCustomChoice(null)}
              className="text-xs font-black text-[#8a8296] hover:text-[#171321]"
            >
              取消
            </button>
          </div>
        )}
        {quickActions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={() => submit(action.message)}
                disabled={loading}
                className="prep-secondary"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={customChoice ? '直接补充你的真实情况…' : placeholder}
            rows={1}
            disabled={loading}
            className="prep-input min-h-[40px] flex-1 resize-none px-3 py-2 text-sm disabled:bg-white/50"
          />
          <button
            onClick={() => submit()}
            disabled={!input.trim() || loading}
            className="prep-primary h-10"
          >
            发送
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#8a8296]">
          <span>Enter 发送，Shift+Enter 换行</span>
          <button onClick={clearAgent} className="hover:text-[#171321]">清空当前对话</button>
        </div>
      </div>
    </div>
  )
}

function AgentWorkspaceMessage({ message, onChoiceSelect }) {
  const [selected, setSelected] = useState([])
  const isUser = message.role === 'user'
  const content = isUser ? message.content : cleanAssistantDisplay(message.content)
  const { loading } = useAgent()
  const choice = !isUser ? splitChoiceContent(content) : { body: content, options: [] }
  const displayContent = isUser ? content : (choice.body || content)
  const choiceOptions = choice.options
  const isMultiple = Boolean(choice.multiple)
  if (!content) return null

  const toggleSelected = option => {
    if (isCustomChoice(option)) {
      onChoiceSelect?.(option)
      return
    }
    setSelected(prev => {
      const exists = prev.some(item => item.label === option.label)
      return exists ? prev.filter(item => item.label !== option.label) : [...prev, option]
    })
  }

  const submitSelected = () => {
    if (selected.length === 0) return
    onChoiceSelect?.({
      label: selected.map(item => item.label).join('、'),
      text: selected.map(item => item.text).join('；'),
      message: `我选择了 ${selected.map(item => item.label).join('、')}：\n${selected.map(item => `${item.label}. ${item.text}`).join('\n')}`,
    })
    setSelected([])
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
        isUser ? 'bg-[#55dff1] text-[#171321]' : 'bg-[#171321] text-white'
      }`}>
        {isUser ? '你' : 'AI'}
      </div>
      <div className="max-w-[86%]">
        <div className={`rounded-2xl px-3 py-2 text-sm leading-6 ${
          isUser ? 'bg-[#171321] text-white' : 'bg-white/78 text-[#41394d]'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{displayContent}</p>
          ) : (
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </div>
          )}
        </div>
        {choiceOptions.length > 0 && (
          <ExperienceChoiceCards
            options={choiceOptions}
            selected={selected}
            multiple={isMultiple}
            disabled={loading}
            onSelect={option => isMultiple ? toggleSelected(option) : onChoiceSelect?.(option)}
            onConfirm={submitSelected}
          />
        )}
      </div>
    </div>
  )
}
