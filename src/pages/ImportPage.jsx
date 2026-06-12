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
  const [parseNote, setParseNote] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [resumeText, setResumeText] = useState('')

  const parseResumeText = useCallback(async (text, sourceName = '简历文本') => {
    if (!text.trim()) {
      setErrorMsg('没有可识别的简历文字，请先粘贴简历内容。')
      setStep('error')
      return
    }

    setStep('parsing')
    setFileName(sourceName)

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
  }, [settings, refreshExperiences, navigate])

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
    setParseNote('')

    let text = ''
    try {
      const result = await extractTextFromPDF(file)
      text = result.text
      if (result.skippedPages?.length) {
        setParseNote(`有 ${result.skippedPages.length} 页 PDF 结构较特殊，已跳过这些页面并继续识别。`)
      }
    } catch (err) {
      setErrorMsg(`PDF 解析失败：${err.message}`)
      setStep('error')
      return
    }

    if (!text.trim()) {
      setErrorMsg('未能提取到文字。请确认这是文字版 PDF（非扫描件），或改用粘贴文本导入。')
      setStep('error')
      return
    }

    await parseResumeText(text, file.name)
  }, [isConfigured, parseResumeText, setShowSettings])

  const handleTextImport = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    setErrorMsg('')
    setParseNote('')
    await parseResumeText(resumeText, '粘贴的简历文本')
  }

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
          <div className="mt-4">
            <button
              onClick={() => setShowTextInput(v => !v)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50"
            >
              {showTextInput ? '收起文本导入' : '粘贴简历文本导入'}
            </button>
          </div>
          {showTextInput && (
            <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4">
              <textarea
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
                rows={10}
                placeholder="把简历全文复制到这里，系统会自动识别工作/实习/项目经历并存入经历库。"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">适合 PDF 解析失败、扫描件或网页简历复制导入。</p>
                <button
                  onClick={handleTextImport}
                  disabled={!resumeText.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  识别文本
                </button>
              </div>
            </div>
          )}
          {step === 'error' && errorMsg && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {errorMsg}
              <p className="text-xs mt-2 text-red-500">
                可以尝试用浏览器、预览或 WPS 重新导出 PDF；如果仍失败，可以点击“粘贴简历文本导入”。
              </p>
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
            {parseNote && <p className="text-xs text-amber-600 mt-2">{parseNote}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
