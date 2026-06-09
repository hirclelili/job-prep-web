import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel'
import OutputPanel from '../components/OutputPanel'
import { EXPERIENCE_SYSTEM, EXPERIENCE_OPENING } from '../prompts/experience'
import { saveExperience } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

const CHAT_KEY = 'experience'
const OUTPUT_STORAGE_KEY = 'job_prep_exp_output'

function extractExperienceJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
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
  return text.split('\n')
    .filter(l => l.trim().match(/^[-·•]\s+/))
    .map(l => l.trim().replace(/^[-·•]\s+/, ''))
    .filter(l => l.length > 10)
}

function buildFallbackExp(text) {
  const timeMatch = text.match(/(\d{4}[.\-年]\d+)\s*[-–—~]\s*(\d{4}[.\-年]\d+|至今|present)/i)
  return {
    title: timeMatch ? `经历 · ${timeMatch[0]}` : `经历 · ${new Date().toLocaleDateString('zh-CN')}`,
    company: '', role: '', time: timeMatch ? timeMatch[0] : '',
    resume_bullets: parseBulletsFromText(text),
    star_story: (text.match(/##\s+口述故事[^\n]*\n([\s\S]*?)(?=##|$)/)?.[1] || '').trim(),
    key_metrics: [], highlights: [], skills_demonstrated: [],
  }
}

export default function ExperiencePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshExperiences } = useApp()

  // Restore output from localStorage so it survives navigation
  const [outputText, setOutputText] = useState(() => {
    try { return localStorage.getItem(OUTPUT_STORAGE_KEY) || '' } catch { return '' }
  })
  const [parsedExp, setParsedExp] = useState(null)
  const [hasOutput, setHasOutput] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)

  const prefillText = location.state?.prefillText || null
  const existingId  = location.state?.existingId  || null

  // When navigating from library with prefillText, always start a fresh session
  // so the auto-send fires on a clean chat (not one restored from localStorage)
  const prefillHandledRef = useRef(false)
  useEffect(() => {
    if (prefillText && !prefillHandledRef.current) {
      prefillHandledRef.current = true
      localStorage.removeItem('job_prep_chat_' + CHAT_KEY)
      localStorage.removeItem(OUTPUT_STORAGE_KEY)
      setOutputText('')
      setHasOutput(false)
      setSaved(false)
      setSessionKey(k => k + 1)
    }
  }, [prefillText])

  // Persist output text across navigation
  useEffect(() => {
    if (outputText) localStorage.setItem(OUTPUT_STORAGE_KEY, outputText)
  }, [outputText])

  const handleAssistantMessage = useCallback((text) => {
    if (!isFinalOutput(text)) return
    const readable = extractReadable(text)
    setOutputText(readable)
    setHasOutput(true)
    setSaved(false)   // new output → reset saved state, user must re-confirm
    const exp = extractExperienceJson(text)
    setParsedExp(exp || buildFallbackExp(readable))
  }, [])

  const handleSave = () => {
    if (!parsedExp) return
    const toSave = existingId
      ? { ...parsedExp, id: existingId, status: 'optimized' }
      : { ...parsedExp, status: 'optimized' }
    saveExperience(toSave)
    refreshExperiences()
    setSaved(true)
  }

  const handleNew = () => {
    // Clear persisted state for this session
    localStorage.removeItem('job_prep_chat_' + CHAT_KEY)
    localStorage.removeItem(OUTPUT_STORAGE_KEY)
    setOutputText('')
    setParsedExp(null)
    setHasOutput(false)
    setSaved(false)
    setSessionKey(k => k + 1)
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left: Chat */}
      <div className="w-[420px] shrink-0 flex flex-col border-r border-gray-100 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">整理经历</h2>
            <p className="text-xs text-gray-400 mt-0.5">AI 采访你，帮你提炼完整面试素材</p>
          </div>
          <button
            onClick={handleNew}
            className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200"
          >
            + 新经历
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            key={sessionKey}
            storageKey={CHAT_KEY}
            systemPrompt={EXPERIENCE_SYSTEM}
            initialMessage={prefillText ? null : EXPERIENCE_OPENING}
            autoSendMessage={prefillText}
            onAssistantMessage={handleAssistantMessage}
            placeholder="回答 AI 的问题…"
          />
        </div>
      </div>

      {/* Right: Output */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">经历档案</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {outputText
                ? '简历条目 · STAR拆解 · 核心亮点 · 追问预测'
                : '采访结束后这里自动生成'}
            </p>
          </div>
          {hasOutput && (
            <div className="flex gap-2 items-center">
              {!saved ? (
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  💾 保存到经历库
                </button>
              ) : (
                <>
                  <span className="text-xs text-green-600 font-medium">✓ 已保存</span>
                  <button
                    onClick={() => navigate('/library')}
                    className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                  >
                    查看经历库 →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <OutputPanel
            content={outputText}
            emptyText={`采访进行中…\n\n采访结束后生成：\n· 简历条目\n· STAR 完整拆解\n· 核心亮点 ×4\n· 追问预测 ×3-5\n· 口述故事版`}
          />
        </div>
      </div>
    </div>
  )
}
