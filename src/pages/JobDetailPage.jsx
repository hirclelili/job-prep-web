import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OutputPanel from '../components/OutputPanel'
import { getJob, getResumes, saveJob } from '../utils/storage'
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
    return new Date(value).toLocaleString('zh-CN')
  } catch {
    return ''
  }
}

export default function JobDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { restoreAgentThread } = useAgent()
  const [job, setJob] = useState(() => getJob(id))
  const [activeTab, setActiveTab] = useState(job?.knowledgeSystem ? 'knowledge' : 'manual')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(job?.title || '')
  const [jdExpanded, setJdExpanded] = useState(false)
  const [editingJd, setEditingJd] = useState(false)
  const [jdInput, setJdInput] = useState(job?.jdText || '')
  const [resumes] = useState(() => getResumes())
  const relatedResumes = useMemo(() => {
    if (!job) return []
    const jdText = job.jdText?.trim()
    return resumes.filter(resume => {
      if (resume.jobId === job.id) return true
      return !resume.jobId && jdText && resume.jdText?.trim() === jdText
    })
  }, [job, resumes])

  if (!job) {
    return (
      <div className="prep-bg flex h-[calc(100vh-64px)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-black text-[#171321]">没有找到这个岗位</p>
        <button
          onClick={() => navigate('/jobs')}
          className="prep-primary"
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
    const threadId = `job:${job.id}`
    const existingThread = getAgentThread(threadId)
    restoreAgentThread(existingThread.length ? existingThread : (job.chatMessages || []), threadId)
    navigate(`/jobs/${job.id}/prepare`)
  }

  const createResumeForJob = () => {
    navigate('/resumes', {
      state: {
        mode: 'editor',
        jdText: job.jdText || '',
        target: job.title || '',
        title: `${job.title || '岗位'} 定制简历`,
        fromJobId: job.id,
      },
    })
  }

  const saveTitle = () => {
    if (!titleInput.trim()) return
    const updated = saveJob({ ...job, title: titleInput.trim() })
    setJob(updated)
    setEditingTitle(false)
  }

  const saveJd = () => {
    const updated = saveJob({ ...job, jdText: jdInput.trim() })
    setJob(updated)
    setEditingJd(false)
    setJdExpanded(false)
  }

  const hasManual = !!job.interviewManual?.trim()
  const hasKnowledge = !!job.knowledgeSystem?.trim()

  const openResumeVersion = (resume) => {
    navigate('/resumes', {
      state: {
        mode: 'library',
        resumeId: resume.id,
        fromJobId: job.id,
      },
    })
  }

  const tabs = (
    <>
      <button
        onClick={() => setActiveTab('manual')}
        className={`prep-ghost ${
          activeTab === 'manual'
            ? 'bg-[#171321] text-white'
            : ''
        }`}
      >
        面试手册
      </button>
      <button
        onClick={() => setActiveTab('knowledge')}
        disabled={!job.knowledgeSystem}
        className={`prep-ghost disabled:cursor-not-allowed disabled:opacity-40 ${
          activeTab === 'knowledge'
            ? 'bg-[#171321] text-white'
            : ''
        }`}
      >
        知识体系
      </button>
      <div className="flex-1" />
      <button
        onClick={continuePrepare}
        className="prep-primary"
      >
        {hasManual ? '继续准备' : '开始准备'}
      </button>
    </>
  )

  const content = activeTab === 'knowledge' ? job.knowledgeSystem : job.interviewManual
  const emptyText = activeTab === 'knowledge'
    ? '这个岗位还没有生成知识体系'
    : '这个岗位还没有保存面试手册'

  return (
    <div className="prep-bg min-h-[calc(100vh-64px)]">
      <main className="prep-shell">
        <button
          onClick={() => navigate('/jobs')}
          className="prep-ghost mb-3 min-h-[30px]"
        >
          返回岗位库
        </button>

        <section className="prep-panel mb-4 overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="prep-kicker">岗位材料页</p>
              {editingTitle ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    className="prep-input w-96 max-w-full px-3 py-2 text-sm"
                    autoFocus
                  />
                  <button onClick={saveTitle} disabled={!titleInput.trim()} className="prep-primary">
                    保存
                  </button>
                  <button onClick={() => { setEditingTitle(false); setTitleInput(job.title) }} className="prep-ghost">
                    取消
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="prep-title truncate text-2xl">{job.title}</h1>
                  <button onClick={() => setEditingTitle(true)} className="prep-ghost min-h-[30px] px-3">
                    改名
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#dffbff]/78 px-3 py-1 text-[11px] font-black text-[#126274]">
                  JD {job.jdText?.trim() ? '已保存' : '缺失'}
                </span>
                <span className="rounded-full bg-[#fff6c9]/82 px-3 py-1 text-[11px] font-black text-[#7a5400]">
                  简历版本 {relatedResumes.length ? `${relatedResumes.length} 版` : '未生成'}
                </span>
                <span className="rounded-full bg-[#ecfff5]/78 px-3 py-1 text-[11px] font-black text-[#16704a]">
                  面试手册 {hasManual ? '已生成' : '未生成'}
                </span>
                <span className="rounded-full bg-[#fff3fb]/78 px-3 py-1 text-[11px] font-black text-[#8b2d6f]">
                  知识体系 {hasKnowledge ? '已生成' : '未生成'}
                </span>
                <span className="rounded-full bg-white/72 px-3 py-1 text-[11px] font-black text-[#8a8296]">
                  更新于 {formatDate(job.updatedAt)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={createResumeForJob} className="prep-secondary">
                生成简历版本
              </button>
              <button onClick={continuePrepare} className="prep-primary">
                {hasManual ? '继续面试准备' : '开始面试准备'}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#171321]/8 bg-white/52">
            <button
              onClick={() => setJdExpanded(value => !value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a8296]">JD 原文</p>
                <p className="mt-1 truncate text-sm font-bold text-[#41394d]">
                  {job.jdText || '这个岗位还没有 JD 原文'}
                </p>
              </div>
              <span className="prep-chip shrink-0">{jdExpanded ? '收起' : '展开'}</span>
            </button>
            {jdExpanded && (
              <div className="border-t border-[#171321]/8 p-4">
                <div className="mb-3 flex justify-end gap-2">
                  {editingJd ? (
                    <>
                      <button onClick={() => { setEditingJd(false); setJdInput(job.jdText || '') }} className="prep-ghost">取消</button>
                      <button onClick={saveJd} disabled={!jdInput.trim()} className="prep-primary disabled:cursor-not-allowed disabled:opacity-40">保存 JD</button>
                    </>
                  ) : (
                    <button onClick={() => { setEditingJd(true); setJdExpanded(true) }} className="prep-secondary">修改 JD</button>
                  )}
                </div>
                {editingJd ? (
                  <textarea
                    value={jdInput}
                    onChange={e => setJdInput(e.target.value)}
                    rows={10}
                    className="prep-input w-full resize-none px-4 py-3 text-sm leading-6"
                    autoFocus
                  />
                ) : (
                  <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-[18px] bg-white/72 p-4 text-sm font-semibold leading-7 text-[#41394d]">
                    {job.jdText || '这个岗位还没有 JD 原文'}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="grid min-h-[calc(100vh-310px)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="prep-panel min-h-[620px] overflow-hidden">
            <OutputPanel
              content={content}
              emptyText={emptyText}
              actions={tabs}
              variant={activeTab === 'knowledge' ? 'knowledge' : 'default'}
            />
          </section>

          <aside className="space-y-4">
            <section className="prep-panel max-h-[620px] overflow-hidden p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="prep-kicker">简历版本</p>
                <span className="rounded-full bg-[#fff6c9] px-3 py-1 text-xs font-black text-[#7a5400]">
                  {relatedResumes.length} 版
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {relatedResumes.length ? (
                  relatedResumes.map(resume => (
                    <button
                      key={resume.id}
                      onClick={() => openResumeVersion(resume)}
                      className="prep-card-button p-4 text-left"
                    >
                      <p className="truncate text-base font-black text-[#171321]">{resume.title}</p>
                      <p className="mt-1 text-xs font-semibold text-[#8a8296]">
                        {resume.target || '未设置方向'} · 更新于 {formatDate(resume.updatedAt)}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] bg-white/65 p-4">
                    <p className="text-sm font-black text-[#171321]">还没有这个岗位的简历版本</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#8a8296]">生成后会沉淀在这里，后续可以直接查看、修改或再生成新版。</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
