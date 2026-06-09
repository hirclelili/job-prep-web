import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OutputPanel from '../components/OutputPanel'
import { getJob, saveJob } from '../utils/storage'

const CHAT_KEY = 'job_prep_chat_battle-plan'
const INTERVIEW_OUTPUT_KEY = 'job_prep_interview_output'
const KNOWLEDGE_OUTPUT_KEY = 'job_prep_knowledge_output'
const ACTIVE_OUTPUT_KEY = 'job_prep_battle_active_output'
const CURRENT_JOB_ID_KEY = 'job_prep_current_job_id'
const CURRENT_JOB_TITLE_KEY = 'job_prep_current_job_title'

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('zh-CN')
  } catch {
    return ''
  }
}

export default function JobDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [job, setJob] = useState(() => getJob(id))
  const [activeTab, setActiveTab] = useState(job?.knowledgeSystem ? 'knowledge' : 'manual')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(job?.title || '')

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4 text-center px-4">
        <p className="text-gray-600 font-medium">没有找到这个岗位</p>
        <button
          onClick={() => navigate('/jobs')}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          返回岗位库
        </button>
      </div>
    )
  }

  const continuePrepare = () => {
    localStorage.setItem(INTERVIEW_OUTPUT_KEY, job.interviewManual || '')
    localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, job.knowledgeSystem || '')
    localStorage.setItem(ACTIVE_OUTPUT_KEY, activeTab === 'knowledge' ? 'knowledge' : 'battle')
    localStorage.setItem(CURRENT_JOB_ID_KEY, job.id)
    localStorage.setItem(CURRENT_JOB_TITLE_KEY, job.title)
    localStorage.setItem(CHAT_KEY, JSON.stringify(job.chatMessages || []))
    navigate('/battle-plan')
  }

  const saveTitle = () => {
    if (!titleInput.trim()) return
    const updated = saveJob({ ...job, title: titleInput.trim() })
    setJob(updated)
    setEditingTitle(false)
  }

  const tabs = (
    <>
      <button
        onClick={() => setActiveTab('manual')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
          activeTab === 'manual'
            ? 'bg-blue-600 text-white'
            : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        面试手册
      </button>
      <button
        onClick={() => setActiveTab('knowledge')}
        disabled={!job.knowledgeSystem}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
          activeTab === 'knowledge'
            ? 'bg-indigo-600 text-white'
            : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        知识体系
      </button>
      <div className="flex-1" />
      <button
        onClick={continuePrepare}
        className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700"
      >
        继续准备
      </button>
    </>
  )

  const content = activeTab === 'knowledge' ? job.knowledgeSystem : job.interviewManual
  const emptyText = activeTab === 'knowledge'
    ? '这个岗位还没有生成知识体系'
    : '这个岗位还没有保存面试手册'

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-white">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/jobs')}
            className="text-xs text-gray-400 hover:text-gray-700 mb-1"
          >
            ← 返回岗位库
          </button>
          {editingTitle ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                className="w-80 max-w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                autoFocus
              />
              <button
                onClick={saveTitle}
                disabled={!titleInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                保存
              </button>
              <button
                onClick={() => { setEditingTitle(false); setTitleInput(job.title) }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-gray-900 truncate">{job.title}</h1>
              <button
                onClick={() => setEditingTitle(true)}
                className="px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50"
              >
                改名
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-0.5">更新于 {formatDate(job.updatedAt)}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <OutputPanel
          content={content}
          emptyText={emptyText}
          actions={tabs}
          variant={activeTab === 'knowledge' ? 'knowledge' : 'default'}
        />
      </div>
    </div>
  )
}
