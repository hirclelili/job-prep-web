import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteJob, getJobs } from '../utils/storage'

const CHAT_KEY = 'job_prep_chat_battle-plan'
const INTERVIEW_OUTPUT_KEY = 'job_prep_interview_output'
const KNOWLEDGE_OUTPUT_KEY = 'job_prep_knowledge_output'
const ACTIVE_OUTPUT_KEY = 'job_prep_battle_active_output'
const CURRENT_JOB_ID_KEY = 'job_prep_current_job_id'
const CURRENT_JOB_TITLE_KEY = 'job_prep_current_job_title'

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

function JobCard({ job, onView, onContinue, onDelete }) {
  const hasManual = !!job.interviewManual?.trim()
  const hasKnowledge = !!job.knowledgeSystem?.trim()

  return (
    <div className="border border-gray-100 rounded-2xl bg-white overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {hasManual && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">面试手册</span>}
            {hasKnowledge && <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">知识体系</span>}
            {!hasKnowledge && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">待生成知识体系</span>}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{job.title}</h3>
          <p className="text-xs text-gray-400 mt-1">更新于 {formatDate(job.updatedAt)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onView(job)}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            查看
          </button>
          <button
            onClick={() => onContinue(job)}
            className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            继续准备
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-100 hover:bg-red-50"
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
  const [jobs, setJobs] = useState(() => getJobs())

  const handleNewJob = () => {
    localStorage.removeItem(CHAT_KEY)
    localStorage.removeItem(INTERVIEW_OUTPUT_KEY)
    localStorage.removeItem(KNOWLEDGE_OUTPUT_KEY)
    localStorage.removeItem(ACTIVE_OUTPUT_KEY)
    localStorage.removeItem(CURRENT_JOB_ID_KEY)
    localStorage.removeItem(CURRENT_JOB_TITLE_KEY)
    navigate('/battle-plan')
  }

  const handleContinue = (job) => {
    localStorage.setItem(INTERVIEW_OUTPUT_KEY, job.interviewManual || '')
    localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, job.knowledgeSystem || '')
    localStorage.setItem(ACTIVE_OUTPUT_KEY, job.activeOutput || 'battle')
    localStorage.setItem(CURRENT_JOB_ID_KEY, job.id)
    localStorage.setItem(CURRENT_JOB_TITLE_KEY, job.title)
    localStorage.setItem(CHAT_KEY, JSON.stringify(job.chatMessages || []))
    navigate('/battle-plan')
  }

  const handleView = (job) => {
    navigate(`/jobs/${job.id}`)
  }

  const handleDelete = (id) => {
    if (!window.confirm('确认删除这个岗位？')) return
    deleteJob(id)
    setJobs(getJobs())
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4 text-center px-4">
        <span className="text-4xl">🎯</span>
        <div>
          <p className="text-gray-600 font-medium">岗位库是空的</p>
          <p className="text-gray-400 text-sm mt-1">生成面试手册后，可以把岗位保存到这里</p>
        </div>
        <button
          onClick={handleNewJob}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          去备战面试
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-gray-900">岗位库</h1>
          <p className="text-xs text-gray-400 mt-0.5">共 {jobs.length} 个岗位</p>
        </div>
        <button
          onClick={handleNewJob}
          className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          + 新岗位
        </button>
      </div>

      <div className="space-y-3">
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onView={handleView}
            onContinue={handleContinue}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
