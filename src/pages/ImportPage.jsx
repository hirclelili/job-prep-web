import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractTextFromPDF } from '../utils/pdfExtract'
import { buildParsePrompt, RESUME_PARSER_SYSTEM } from '../prompts/resumeParser'
import { streamChat } from '../services/llm'
import { bulkImportExperiences } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

function parseJsonFromText(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

export default function ImportPage() {
  const navigate = useNavigate()
  const { settings, isConfigured, setShowSettings, refreshExperiences } = useApp()
  const fileInputRef = useRef(null)

  const [step, setStep] = useState('upload')   // upload | extracting | parsing | error
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setErrorMsg('请上传 PDF 文件')
      setStep('error')
      return
    }
    if (!isConfigured) { setShowSettings(true); return }

    setFileName(file.name)
    setStep('extracting')
    setErrorMsg('')

    // 1. Extract text
    let text = ''
    try {
      const result = await extractTextFromPDF(file)
      text = result.text
    } catch (err) {
      setErrorMsg(`PDF 解析失败：${err.message}`)
      setStep('error')
      return
    }

    if (!text.trim()) {
      setErrorMsg('未能提取到文字。请确认这是文字版 PDF（非扫描件）。')
      setStep('error')
      return
    }

    setStep('parsing')

    // 2. AI parse
    let full = ''
    try {
      const gen = streamChat({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: [{ role: 'user', content: buildParsePrompt(text) }],
        system: RESUME_PARSER_SYSTEM,
      })
      for await (const chunk of gen) full += chunk
    } catch (err) {
      setErrorMsg(`AI 解析失败：${err.message}`)
      setStep('error')
      return
    }

    const result = parseJsonFromText(full)
    if (!result?.experiences?.length) {
      setErrorMsg('未识别到工作/实习经历，请检查简历格式，或手动整理经历。')
      setStep('error')
      return
    }

    // 3. Bulk-save all to library with status='imported', then go to library
    bulkImportExperiences(result.experiences)
    refreshExperiences()
    navigate('/library', { state: { justImported: result.experiences.length } })
  }, [settings, isConfigured])

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-gray-900">导入简历</h1>
        <p className="text-xs text-gray-400 mt-1">
          上传 PDF，自动识别所有经历并存入经历库，然后按需深度整理
        </p>
      </div>

      {(step === 'upload' || step === 'error') && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => isConfigured ? fileInputRef.current?.click() : setShowSettings(true)}
            className="border-2 border-dashed border-gray-200 rounded-2xl p-14 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm font-medium text-gray-700">点击上传或拖拽 PDF 简历</p>
            <p className="text-xs text-gray-400 mt-1">识别完成后自动存入经历库</p>
            {!isConfigured && (
              <p className="text-xs text-orange-500 mt-2">⚠️ 请先设置 API Key</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => handleFile(e.target.files[0])}
          />
          {step === 'error' && errorMsg && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {errorMsg}
            </div>
          )}
        </>
      )}

      {(step === 'extracting' || step === 'parsing') && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {step === 'extracting' ? '正在提取 PDF 文字…' : 'AI 正在识别经历条目…'}
            </p>
            <p className="text-xs text-gray-400 mt-1">{fileName}</p>
          </div>
        </div>
      )}
    </div>
  )
}
