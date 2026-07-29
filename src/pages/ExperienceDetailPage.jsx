import React, { useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../contexts/AppContext'
import {
  buildExperienceMarkdown,
  downloadExperienceMarkdown,
  downloadExperienceWord,
  printExperiencePdf,
} from '../utils/experienceDocument'
import { getExperience, saveExperience } from '../utils/storage'

const TYPE_LABELS = {
  internship: '实习经历',
  fulltime: '工作经历',
  project: '项目经历',
  campus: '校园经历',
  entrepreneurship: '创业经历',
}

export default function ExperienceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refreshExperiences } = useApp()
  const [experience, setExperience] = useState(() => getExperience(id))
  const [exportOpen, setExportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exportError, setExportError] = useState('')
  const documentRef = useRef(null)

  const markdown = useMemo(
    () => buildExperienceMarkdown(experience || {}),
    [experience],
  )
  const readableMarkdown = useMemo(
    () => markdown.replace(/```json\s*[\s\S]*?```/gi, '').trim(),
    [markdown],
  )

  if (!experience) return <Navigate to="/library" replace />

  const title = experience.title
    || [experience.company, experience.role, experience.time].filter(Boolean).join(' · ')
    || '经历档案'
  const isImported = experience.status === 'imported'

  const continueResearch = () => {
    navigate('/experience', {
      state: {
        existingId: experience.id,
        continueResearch: !isImported,
        prefillText: isImported
          ? [
            experience.company,
            experience.role,
            experience.time,
            ...(experience.resume_bullets || []),
          ].filter(Boolean).join('\n')
          : '我想继续补充和完善这份经历档案。请基于已有档案和之前的调研进度，先问一个最值得补充的具体问题。',
      },
    })
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(readableMarkdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const changeType = event => {
    const next = saveExperience({
      ...experience,
      type: event.target.value,
      typeConfirmed: true,
    })
    setExperience(next)
    refreshExperiences()
  }

  const runExport = action => {
    setExportError('')
    try {
      action()
      setExportOpen(false)
    } catch (error) {
      setExportError(error.message)
    }
  }

  return (
    <div className="experience-detail-page prep-bg">
      <header className="experience-detail-toolbar">
        <button type="button" onClick={() => navigate('/library')} className="prep-ghost">
          返回经历资产
        </button>
        <div className="experience-detail-toolbar-copy">
          <span>{TYPE_LABELS[experience.type] || '经历档案'}</span>
          <strong>{title}</strong>
        </div>
        <div className="experience-detail-toolbar-actions">
          <button type="button" onClick={copyAll} className="prep-ghost">
            {copied ? '已复制' : '复制全文'}
          </button>
          <div className="experience-export-menu">
            <button
              type="button"
              onClick={() => setExportOpen(open => !open)}
              className="prep-secondary"
            >
              导出
            </button>
            {exportOpen && (
              <div className="experience-export-popover">
                <button
                  type="button"
                  onClick={() => runExport(() => downloadExperienceWord({
                    title,
                    documentElement: documentRef.current,
                  }))}
                >
                  Word 文档
                </button>
                <button
                  type="button"
                  onClick={() => runExport(() => printExperiencePdf({
                    title,
                    documentElement: documentRef.current,
                  }))}
                >
                  PDF 文件
                </button>
                <button
                  type="button"
                  onClick={() => runExport(() => downloadExperienceMarkdown({ title, markdown: readableMarkdown }))}
                >
                  Markdown 原文
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={continueResearch} className="prep-primary">
            {isImported ? '开始深度整理' : '继续整理'}
          </button>
        </div>
      </header>

      <main className="experience-detail-layout">
        <article ref={documentRef} id="experience-dossier-document" className="experience-detail-document">
          <div className="experience-detail-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readableMarkdown}</ReactMarkdown>
          </div>
        </article>

        <aside className="experience-detail-aside">
          <div>
            <span>状态</span>
            <strong>{isImported ? '待整理' : '已保存为经历资产'}</strong>
          </div>
          <label>
            <span>经历类型</span>
            <select value={experience.type || 'project'} onChange={changeType}>
              <option value="internship">实习经历</option>
              <option value="fulltime">工作经历</option>
              <option value="project">项目经历</option>
              <option value="campus">校园经历</option>
              <option value="entrepreneurship">创业经历</option>
            </select>
          </label>
          <div>
            <span>最近保存</span>
            <strong>
              {experience.savedAt
                ? new Date(experience.savedAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                : '尚未保存'}
            </strong>
          </div>
          <p>
            继续整理会回到这条经历原来的调研空间，新内容确认后仍保存到当前档案。
          </p>
          {exportError && <p className="experience-export-error">{exportError}</p>}
        </aside>
      </main>
    </div>
  )
}
