import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { runTextSkill } from '../skills/core'
import { resumeParserSkill } from '../skills/resumeParserSkill'
import { bulkImportExperiences, saveOriginalResume, saveProfile } from '../utils/storage'
import { clearDraft, DRAFT_KEYS, formatDraftTime, readDraft, writeDraft } from '../utils/draftStorage'
import { useApp } from '../contexts/AppContext'
import PathHeader from '../components/PathHeader'

export default function ImportPage() {
  const navigate = useNavigate()
  const { settings, isConfigured, setShowSettings, refreshExperiences } = useApp()
  const fileInputRef = useRef(null)
  const [initialDraft] = useState(() => readDraft(DRAFT_KEYS.resumeImport))

  const [step, setStep] = useState('upload')   // upload | extracting | parsing | error
  const [fileName, setFileName] = useState(() => initialDraft?.data?.fileName || '')
  const [errorMsg, setErrorMsg] = useState('')
  const [parseNote, setParseNote] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [localFallbackText, setLocalFallbackText] = useState('')
  const [showTextInput, setShowTextInput] = useState(() => !!initialDraft?.data?.resumeText)
  const [resumeText, setResumeText] = useState(() => initialDraft?.data?.resumeText || '')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(() => initialDraft?.updatedAt || '')
  const [restoredDraft, setRestoredDraft] = useState(() => Boolean(initialDraft?.data?.resumeText))

  useEffect(() => {
    if (!resumeText.trim() && !showTextInput) {
      clearDraft(DRAFT_KEYS.resumeImport)
      setDraftUpdatedAt('')
      return
    }
    const saved = writeDraft(DRAFT_KEYS.resumeImport, {
      fileName,
      resumeText,
      showTextInput,
    })
    if (saved) setDraftUpdatedAt(saved.updatedAt)
  }, [fileName, resumeText, showTextInput])

  const parseResumeText = useCallback(async (text, sourceName = '简历文本', options = {}) => {
    const silent = Boolean(options.silent)
    if (!text.trim()) {
      const message = '没有可识别的简历文字，请先粘贴简历内容。'
      if (!silent) {
        setErrorMsg(message)
        setStep('error')
      }
      return { ok: false, message }
    }

    setStep('parsing')
    setFileName(sourceName)

    let result = null
    try {
      result = await runTextSkill({
        skill: resumeParserSkill,
        settings,
        input: { resumeText: text },
      })
    } catch (err) {
      const message = `AI 解析失败：${err.message}`
      if (!silent) {
        setErrorMsg(message)
        setShowTextInput(true)
        setStep('error')
      }
      return { ok: false, message }
    }
    if (!result?.experiences?.length) {
      const message = '未识别到工作/实习经历，请检查简历格式，或手动做经历调研。'
      if (!silent) {
        setErrorMsg(message)
        setShowTextInput(true)
        setStep('error')
      }
      return { ok: false, message }
    }

    if (result.profile) saveProfile(result.profile)
    saveOriginalResume({
      sourceName,
      rawText: text,
      profile: result.profile || {},
      sourceSections: result.sourceSections || [],
      experiences: result.experiences || [],
    })

    // 3. Bulk-save all to library with status='imported', then go to library
    bulkImportExperiences(result.experiences)
    refreshExperiences()
    clearDraft(DRAFT_KEYS.resumeImport)
    navigate('/library', { state: { justImported: result.experiences.length } })
    return { ok: true }
  }, [settings, refreshExperiences, navigate])

  const parseWithMinerU = useCallback(async (file, reason = '') => {
    if (!file) return false
    setStep('enhancing')
    setErrorMsg('')
    setParseNote(reason || '本地解析结果不完整，正在切换增强解析。')
    try {
      const { extractResumeWithMinerU } = await import('../services/mineru')
      const result = await extractResumeWithMinerU(file)
      setResumeText(result.text)
      setParseNote('增强解析已完成，正在识别简历结构。')
      const parsed = await parseResumeText(result.text, file.name)
      return Boolean(parsed?.ok)
    } catch (error) {
      setErrorMsg(`增强解析失败：${error.message}`)
      setShowTextInput(Boolean(localFallbackText))
      setStep('error')
      return false
    }
  }, [localFallbackText, parseResumeText])

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setErrorMsg('请上传 PDF 文件')
      setStep('error')
      return
    }
    if (!isConfigured) { setShowSettings(true); return }

    setFileName(file.name)
    setSelectedFile(file)
    setLocalFallbackText('')
    setStep('extracting')
    setErrorMsg('')
    setParseNote('')

    let text = ''
    let localResult = null
    try {
      const { extractTextFromPDF } = await import('../utils/pdfExtract')
      localResult = await extractTextFromPDF(file)
      text = localResult.text
    } catch (err) {
      await parseWithMinerU(file, `本地解析失败，正在使用增强解析：${err.message}`)
      return
    }

    setLocalFallbackText(text)
    if (localResult.quality?.shouldEnhance) {
      const reason = localResult.quality.reasons.join('、') || '本地提取结果不完整'
      await parseWithMinerU(file, `${reason}，正在使用增强解析。`)
      return
    }

    setResumeText(text)
    const parsed = await parseResumeText(text, file.name, { silent: true })
    if (!parsed?.ok) {
      await parseWithMinerU(file, '本地文字未能完整识别出经历，正在使用增强解析重新整理版面。')
    }
  }, [isConfigured, parseResumeText, parseWithMinerU, setShowSettings])

  const handleTextImport = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    setErrorMsg('')
    setParseNote('')
    setSelectedFile(null)
    setLocalFallbackText('')
    await parseResumeText(resumeText, '粘贴的简历文本')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleClearImportDraft = () => {
    clearDraft(DRAFT_KEYS.resumeImport)
    setResumeText('')
    setShowTextInput(false)
    setFileName('')
    setErrorMsg('')
    setParseNote('')
    setStep('upload')
    setDraftUpdatedAt('')
    setRestoredDraft(false)
  }

  return (
    <div className="prep-bg">
      <main className="prep-shell">
      <PathHeader
        current="import"
        title="简历导入"
        subtitle="把已有 PDF 或文本简历解析成基础信息和原始经历，作为后续调研的入口。"
      />
      <div className="mx-auto max-w-2xl">

      {resumeText.trim() && draftUpdatedAt && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#b6ffdd]/70 bg-[#ecfff5]/80 px-4 py-3">
          <div>
            <p className="text-sm font-black text-[#16704a]">
              {restoredDraft ? '已恢复上次未完成的导入文本' : '导入文本已自动保存到本机'}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#6f667d]">
              保存于 {formatDraftTime(draftUpdatedAt)}，可以继续识别。
            </p>
          </div>
          <button onClick={handleClearImportDraft} className="prep-ghost shrink-0">
            清除草稿
          </button>
        </div>
      )}

      {(step === 'upload' || step === 'error') && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => isConfigured ? fileInputRef.current?.click() : setShowSettings(true)}
            className="border-2 border-dashed border-gray-200 rounded-2xl p-14 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
          >
            <div className="mx-auto mb-3 flex h-12 w-10 items-center justify-center rounded-xl border-2 border-violet-200 bg-white text-xs font-black text-violet-500">
              PDF
            </div>
            <p className="text-sm font-medium text-gray-700">点击上传或拖拽 PDF 简历</p>
            <p className="text-xs text-gray-400 mt-1">复杂版式或扫描版会自动切换增强解析</p>
            {!isConfigured && (
              <p className="text-xs text-orange-500 mt-2">请先设置 API Key</p>
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
                onChange={e => {
                  setResumeText(e.target.value)
                  setRestoredDraft(false)
                }}
                rows={10}
                placeholder="把简历全文复制到这里，系统会自动识别基础信息、教育、技能和经历。"
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
                可以重新尝试增强解析，或展开文本框检查并修改识别内容。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => parseWithMinerU(selectedFile, '正在重新尝试增强解析。')}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                  >
                    重新增强解析
                  </button>
                )}
                {localFallbackText.trim() && (
                  <button
                    type="button"
                    onClick={() => parseResumeText(localFallbackText, selectedFile?.name || fileName)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
                  >
                    使用本地文字继续
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {(step === 'extracting' || step === 'enhancing' || step === 'parsing') && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {step === 'extracting'
                ? '正在检查 PDF 文字…'
                : step === 'enhancing'
                  ? '正在使用增强解析恢复版面…'
                  : 'AI 正在识别经历条目…'}
            </p>
            <p className="text-xs text-gray-400 mt-1">{fileName}</p>
            {parseNote && <p className="text-xs text-amber-600 mt-2">{parseNote}</p>}
          </div>
        </div>
      )}
      </div>
      </main>
    </div>
  )
}
