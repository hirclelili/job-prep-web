import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamChat } from '../services/llm'
import { useApp } from '../contexts/AppContext'

const CHAT_STORAGE_PREFIX = 'job_prep_chat_'

// Strip JSON code blocks from AI messages before displaying in chat
function cleanForDisplay(content) {
  const stripped = content
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '')
    .trim()
  return stripped || '✓ 档案已生成，查看右侧面板。'
}

export default function ChatPanel({
  systemPrompt, initialMessage, autoSendMessage,
  onAssistantMessage, placeholder = '输入消息…', storageKey, quickActions = [],
}) {
  const { settings, isConfigured, setShowSettings } = useApp()
  const [messages, setMessages] = useState(() => {
    if (!storageKey) return []
    try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_PREFIX + storageKey)) || [] }
    catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(false)
  const autoSentRef = useRef(false)

  useEffect(() => {
    if (storageKey && messages.length > 0)
      localStorage.setItem(CHAT_STORAGE_PREFIX + storageKey, JSON.stringify(messages))
  }, [messages, storageKey])

  useEffect(() => {
    if (initialMessage && messages.length === 0 && isConfigured) appendAssistant(initialMessage)
  }, [isConfigured])

  useEffect(() => {
    if (autoSendMessage && isConfigured && !autoSentRef.current && messages.length === 0) {
      autoSentRef.current = true
      sendMessage(autoSendMessage)
    }
  }, [isConfigured, autoSendMessage])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  const appendAssistant = (text) => {
    setMessages(prev => [...prev, { role: 'assistant', content: text }])
    onAssistantMessage?.(text)
  }

  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim() || loading) return
    if (!isConfigured) { setShowSettings(true); return }
    const userMsg = { role: 'user', content: userText.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setStreamingText('')
    abortRef.current = false
    let full = ''
    try {
      const gen = streamChat({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model, messages: newMessages, system: systemPrompt })
      for await (const chunk of gen) {
        if (abortRef.current) break
        full += chunk
        setStreamingText(full)
      }
      if (!abortRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: full }])
        onAssistantMessage?.(full)
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ 出错了：' + err.message + '\n\n请检查 API Key 是否正确，或切换供应商重试。' }])
    } finally { setLoading(false); setStreamingText('') }
  }, [messages, loading, settings, systemPrompt, isConfigured])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }
  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [input])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {isConfigured ? '等待开始…' : <button onClick={() => setShowSettings(true)} className="text-blue-500 hover:underline">先设置 API Key，然后开始</button>}
          </div>
        )}
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs shrink-0">AI</div>
            <div className="flex-1 min-w-0">
              {streamingText ? (
                <div className="text-sm text-gray-800 prose cursor-blink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanForDisplay(streamingText)}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex gap-1 pt-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 pb-4 pt-2 border-t border-gray-100">
        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.message)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={placeholder} rows={1} disabled={loading}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50 min-h-[38px]" />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-center">Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const displayContent = isUser ? msg.content : cleanForDisplay(msg.content)
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${isUser ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
        {isUser ? '你' : 'AI'}
      </div>
      <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-3 py-2 rounded-2xl text-sm ${isUser ? 'bg-blue-600 text-white rounded-tr-md' : 'bg-gray-100 text-gray-800 rounded-tl-md'}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{displayContent}</p>
          ) : (
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
