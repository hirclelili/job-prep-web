import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteJob, getJobs, saveJob } from '../utils/storage'
import PathHeader from '../components/PathHeader'
import { useAgent } from '../contexts/AgentContext'

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function suggestJobTitleFromJd(text) {
  const source = String(text || '')
  const candidates = [
    source.match(/(?:公司|Company)\s*[：:]\s*([^\n]+)/i)?.[1],
    source.match(/(?:岗位|职位|Position|Job Title)\s*[：:]\s*([^\n]+)/i)?.[1],
    source.match(/^#{1,3}\s*(.+)$/m)?.[1],
    source.split('\n').map(line => line.trim()).find(line => line.length >= 4 && line.length <= 50),
  ].filter(Boolean)
  const clean = candidates.join(' · ')
    .replace(/\*\*/g, '')
    .replace(/[，。；;].*$/, '')
    .trim()
  return clean ? clean.slice(0, 48) : '未命名岗位'
}

function JobCard({ job, onView, onDelete }) {
  const hasJd = !!job.jdText?.trim()
  const hasManual = !!job.interviewManual?.trim()
  const hasKnowledge = !!job.knowledgeSystem?.trim()

  return (
    <div className="prep-card-button overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {hasJd && <span className="prep-chip prep-chip-soft">已保存 JD</span>}
            {hasManual && <span className="prep-chip prep-chip-hit">面试手册</span>}
            {hasKnowledge && <span className="prep-chip">知识体系</span>}
            {!hasManual && <span className="prep-chip bg-[#fff04a]/35 text-[#9a5a00]">待准备</span>}
          </div>
          <h3 className="truncate text-base font-black text-[#171321]">{job.title}</h3>
          <p className="mt-1 text-xs font-semibold text-[#8a8296]">更新于 {formatDate(job.updatedAt)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onView(job)}
            className="prep-primary"
          >
            打开岗位
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="prep-danger"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default function JobLibraryPage() {
  const navigate = useNavigate()
  const { openAgent } = useAgent()
  const [jobs, setJobs] = useState(() => getJobs())
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJobTitle, setNewJobTitle] = useState('')
  const [newJdText, setNewJdText] = useState('')

  const handleNewJob = () => {
    setNewJobTitle('')
    setNewJdText('')
    setShowNewJob(true)
  }

  const createJob = () => {
    const jdText = newJdText.trim()
    if (!jdText) return
    const saved = saveJob({
      title: newJobTitle.trim() || suggestJobTitleFromJd(jdText),
      jdText,
      interviewManual: '',
      knowledgeSystem: '',
      activeOutput: 'battle',
      chatMessages: [],
    })
    setJobs(getJobs())
    setShowNewJob(false)
    navigate(`/jobs/${saved.id}`)
  }

  const handleView = (job) => {
    navigate(`/jobs/${job.id}`)
  }

  const handleDelete = (id) => {
    if (!window.confirm('确认删除这个岗位？')) return
    deleteJob(id)
    setJobs(getJobs())
  }

  const openJobsAgent = () => {
    openAgent({
      context: {
        stage: '岗位',
        agentThreadId: 'jobs:library',
        pageInstruction: '用户正在岗位库。先调用 jobs.read 读取岗位库，再基于已保存岗位帮助用户做优先级判断。',
        jobsCount: jobs.length,
      },
      draft: jobs.length
        ? '看一下我的岗位库，帮我判断哪个岗位应该优先准备，以及下一步做什么。'
        : '我准备新增岗位，你先告诉我粘贴 JD 后应该怎么整理。',
    })
  }

  if (jobs.length === 0) {
    return (
      <div className="prep-bg">
        <main className="prep-shell">
          <PathHeader
            current="job"
            title="岗位"
            subtitle="这里管理具体投递目标：公司、岗位、JD，以及后续生成的材料索引。"
          />
        <div className="prep-panel mx-auto mt-8 max-w-md p-9 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171321] text-sm font-black text-white shadow-[6px_6px_0_rgba(85,223,241,0.24)]">JD</span>
          <p className="text-xl font-black text-[#171321]">还没有岗位</p>
          <p className="prep-muted mt-2 text-sm">先保存 JD，岗位详情页会沉淀这个岗位对应的简历版本和面试材料。</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={handleNewJob}
              className="prep-primary"
            >
              新增 JD
            </button>
            <button
              onClick={openJobsAgent}
              className="prep-secondary"
            >
              岗位总览
            </button>
          </div>
        </div>
        </main>
        {showNewJob && (
          <NewJobModal
            title={newJobTitle}
            jdText={newJdText}
            onTitleChange={setNewJobTitle}
            onJdTextChange={setNewJdText}
            onCancel={() => setShowNewJob(false)}
            onCreate={createJob}
          />
        )}
      </div>
    )
  }

  return (
    <div className="prep-bg">
      <main className="prep-shell">
      <PathHeader
        current="job"
        title="岗位"
        subtitle="这里管理具体投递目标：公司、岗位、JD，以及后续生成的材料索引。"
      />
      <div className="mb-5 mt-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#171321]">岗位库</h1>
          <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">共 {jobs.length} 个具体岗位，打开后查看 JD、简历版本和面试材料</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleNewJob}
            className="prep-primary"
          >
            新增 JD
          </button>
          <button
            onClick={openJobsAgent}
            className="prep-secondary"
          >
            岗位总览
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onView={handleView}
            onDelete={handleDelete}
          />
        ))}
      </div>
      {showNewJob && (
        <NewJobModal
          title={newJobTitle}
          jdText={newJdText}
          onTitleChange={setNewJobTitle}
          onJdTextChange={setNewJdText}
          onCancel={() => setShowNewJob(false)}
          onCreate={createJob}
        />
      )}
      </main>
    </div>
  )
}

function NewJobModal({ title, jdText, onTitleChange, onJdTextChange, onCancel, onCreate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="prep-panel w-full max-w-2xl overflow-hidden">
        <div className="border-b border-[#171321]/10 px-5 py-4">
          <h2 className="text-base font-black text-[#171321]">新增岗位 JD</h2>
          <p className="mt-1 text-xs font-semibold text-[#8a8296]">先把具体岗位保存下来，之后面试手册、知识体系和对话都会绑定到这个岗位。</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="prep-kicker mb-2 block">岗位名称</label>
            <input
              value={title}
              onChange={event => onTitleChange(event.target.value)}
              className="prep-input w-full px-3 py-2 text-sm"
              placeholder="可留空，保存时会先从 JD 里粗略提取"
            />
          </div>
          <div>
            <label className="prep-kicker mb-2 block">JD 原文</label>
            <textarea
              value={jdText}
              onChange={event => onJdTextChange(event.target.value)}
              rows={12}
              className="prep-input w-full resize-none px-3 py-2 text-sm leading-6"
              placeholder="粘贴公司、岗位职责、任职要求、加分项等内容"
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#171321]/10 px-5 py-4">
          <button
            onClick={onCancel}
            className="prep-ghost"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={!jdText.trim()}
            className="prep-primary"
          >
            保存并打开岗位
          </button>
        </div>
      </div>
    </div>
  )
}
