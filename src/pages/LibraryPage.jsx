import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { deleteExperience } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <button onClick={handle} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
      {done ? '✓ 已复制' : '复制'}
    </button>
  )
}

function StatusBadge({ status }) {
  if (status === 'imported') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-200">
        ⏳ 待优化
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-200">
      ✓ 已优化
    </span>
  )
}

function ExperienceCard({ exp, onDelete, onDeepProcess }) {
  const [expanded, setExpanded] = useState(false)
  const isImported = exp.status === 'imported'
  const bullets = exp.resume_bullets || []
  const story = exp.star_story || ''
  const skills = exp.skills_demonstrated || []
  const metrics = exp.key_metrics || []
  const highlights = exp.highlights || []

  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${
      isImported ? 'border-amber-100' : 'border-gray-100 hover:border-gray-200'
    }`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={exp.status} />
            {metrics.slice(0, 2).map((m, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{m}</span>
            ))}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{exp.title || `${exp.company} · ${exp.role}`}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{exp.time}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isImported && (
            <button
              onClick={() => onDeepProcess(exp)}
              className="px-2.5 py-1.5 rounded-lg text-xs text-indigo-600 font-medium border border-indigo-200 hover:bg-indigo-50"
            >
              ✨ 深度整理
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200"
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            onClick={() => onDelete(exp.id)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-50 border border-red-100"
          >
            删除
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-4 space-y-4">
          {/* Original resume bullets — shown for both imported and optimized */}
          {bullets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">简历条目</span>
                <CopyButton text={bullets.join('\n')} />
              </div>
              <ul className="space-y-1">
                {bullets.map((b, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed list-disc list-inside">{b}</li>
                ))}
              </ul>
            </div>
          )}
          {highlights.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">核心亮点</p>
              <ol className="space-y-1">
                {highlights.map((h, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">
                    <span className="text-gray-400 mr-1">{i + 1}.</span>{h}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {skills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">能力标签</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
          {story && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-gray-500">口述故事版</p>
                <CopyButton text={story} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{story}</p>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { experiences, refreshExperiences } = useApp()
  const justImported = location.state?.justImported

  const importedCount = experiences.filter(e => e.status === 'imported').length
  const optimizedCount = experiences.filter(e => e.status !== 'imported').length

  const handleDelete = (id) => {
    if (window.confirm('确认删除这条经历？')) {
      deleteExperience(id)
      refreshExperiences()
    }
  }

  const handleDeepProcess = (exp) => {
    const prefill = [
      `公司：${exp.company || exp.title || ''}`,
      exp.role ? `职位：${exp.role}` : '',
      exp.time ? `时间：${exp.time}` : '',
      (exp.resume_bullets?.length)
        ? `现有简历条目：\n${exp.resume_bullets.map(b => `- ${b}`).join('\n')}`
        : '',
      '\n请根据以上信息帮我深度整理这段经历，挖掘 STAR 故事和核心亮点。',
    ].filter(Boolean).join('\n')

    navigate('/experience', { state: { prefillText: prefill, existingId: exp.id } })
  }

  if (experiences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4 text-center px-4">
        <span className="text-4xl">📭</span>
        <div>
          <p className="text-gray-600 font-medium">经历库是空的</p>
          <p className="text-gray-400 text-sm mt-1">上传简历一键导入，或手动整理经历</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/import')}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            📤 导入简历
          </button>
          <button
            onClick={() => navigate('/experience')}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            ✍️ 手动整理
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-gray-900">我的经历库</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            共 {experiences.length} 条
            {optimizedCount > 0 && <span className="text-green-600"> · {optimizedCount} 条已优化</span>}
            {importedCount > 0 && <span className="text-amber-600"> · {importedCount} 条待优化</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/import')}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            📤 导入简历
          </button>
          <button
            onClick={() => navigate('/experience')}
            className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + 手动整理
          </button>
        </div>
      </div>

      {/* Just imported banner */}
      {justImported && (
        <div className="mb-4 p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3">
          <span className="text-lg">🎉</span>
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-800">已导入 {justImported} 条经历</p>
            <p className="text-blue-600 text-xs mt-0.5">点击「✨ 深度整理」可以让 AI 帮你挖掘 STAR 故事和面试亮点</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {experiences.map(exp => (
          <ExperienceCard
            key={exp.id}
            exp={exp}
            onDelete={handleDelete}
            onDeepProcess={handleDeepProcess}
          />
        ))}
      </div>
    </div>
  )
}
