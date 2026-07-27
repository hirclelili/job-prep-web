import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PathHeader from '../components/PathHeader'
import { getJobs } from '../utils/storage'
import { useAgent } from '../contexts/AgentContext'
import { getAgentThread } from '../agent/memory'

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

function statusText(job) {
  if (job.interviewManual?.trim() && job.knowledgeSystem?.trim()) return '已生成手册和知识体系'
  if (job.interviewManual?.trim()) return '已生成面试手册'
  return '待开始'
}

export default function InterviewPrepPage() {
  const navigate = useNavigate()
  const { restoreAgentThread } = useAgent()
  const [jobs] = useState(() => getJobs())

  const openPrepare = (job) => {
    localStorage.setItem(INTERVIEW_OUTPUT_KEY, job.interviewManual || '')
    localStorage.setItem(KNOWLEDGE_OUTPUT_KEY, job.knowledgeSystem || '')
    localStorage.setItem(ACTIVE_OUTPUT_KEY, job.knowledgeSystem ? 'knowledge' : 'battle')
    localStorage.setItem(CURRENT_JOB_ID_KEY, job.id)
    localStorage.setItem(CURRENT_JOB_TITLE_KEY, job.title)
    const threadId = `job:${job.id}`
    const existingThread = getAgentThread(threadId)
    restoreAgentThread(existingThread.length ? existingThread : (job.chatMessages || []), threadId)
    navigate(`/jobs/${job.id}/prepare`)
  }

  if (jobs.length === 0) {
    return (
      <div className="prep-bg">
        <main className="prep-shell">
          <PathHeader
            current="interview"
            title="面试准备"
            subtitle="选择一个已经保存的岗位，进入对应的面试手册和知识体系生成页。"
          />
        <div className="prep-panel mx-auto mt-8 max-w-md p-9 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171321] text-sm font-black text-white shadow-[6px_6px_0_rgba(85,223,241,0.24)]">IN</span>
          <p className="text-xl font-black text-[#171321]">还没有可准备的岗位</p>
          <p className="prep-muted mt-2 text-sm">先在岗位页保存 JD，再进入对应岗位的面试准备。</p>
          <button onClick={() => navigate('/jobs')} className="prep-primary mt-5">
            去岗位页
          </button>
        </div>
        </main>
      </div>
    )
  }

  return (
    <div className="prep-bg">
      <main className="prep-shell">
        <PathHeader
          current="interview"
          title="面试准备"
          subtitle="选择一个已经保存的岗位，进入对应的面试手册和知识体系生成页。"
        />

        <div className="mb-5 mt-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-[#171321]">选择要准备的岗位</h1>
            <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">这里不是 JD 详情页，只负责进入具体岗位的面试准备工作区。</p>
          </div>
          <button onClick={() => navigate('/jobs')} className="prep-secondary">
            管理岗位
          </button>
        </div>

        <div className="grid gap-3">
          {jobs.map(job => {
            const hasManual = !!job.interviewManual?.trim()
            const hasKnowledge = !!job.knowledgeSystem?.trim()
            return (
              <div key={job.id} className="prep-card-button overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <span className="prep-chip prep-chip-soft">{job.jdText?.trim() ? 'JD 已保存' : '缺少 JD'}</span>
                      {hasManual && <span className="prep-chip prep-chip-hit">面试手册</span>}
                      {hasKnowledge && <span className="prep-chip">知识体系</span>}
                      {!hasManual && <span className="prep-chip bg-[#fff04a]/35 text-[#9a5a00]">待开始</span>}
                    </div>
                    <h3 className="truncate text-base font-black text-[#171321]">{job.title}</h3>
                    <p className="mt-1 text-xs font-semibold text-[#8a8296]">
                      {statusText(job)} · 更新于 {formatDate(job.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => navigate(`/jobs/${job.id}`)} className="prep-ghost">
                      看岗位
                    </button>
                    <button onClick={() => openPrepare(job)} className="prep-primary">
                      {hasManual ? '继续准备' : '开始准备'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
