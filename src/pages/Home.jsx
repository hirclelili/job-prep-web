import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs, getResumes } from '../utils/storage'
import { DRAFT_KEYS, formatDraftTime, readDraft } from '../utils/draftStorage'
import { useApp } from '../contexts/AppContext'
import HomeProductDemo from '../components/HomeProductDemo'

const flowSteps = [
  {
    title: '导入简历',
    desc: '上传 PDF 或粘贴文本，先把基础信息和经历拆出来。',
    path: '/import',
    color: '#55dff1',
  },
  {
    title: '经历调研',
    desc: '对每段经历继续追问，补全背景、行动、结果和细节。',
    path: '/experience',
    color: '#ff5cc8',
  },
  {
    title: '经历资产',
    desc: '沉淀 STAR、亮点、能力标签和可复用 bullet。',
    path: '/library',
    color: '#fff04a',
  },
  {
    title: '投递材料',
    desc: '选择岗位方向，生成对应的简历版本。',
    path: '/resumes',
    color: '#b6ffdd',
  },
  {
    title: '岗位 JD',
    desc: '保存具体岗位，后续按这个岗位准备。',
    path: '/jobs',
    color: '#725cff',
  },
  {
    title: '面试准备',
    desc: '选择具体岗位，再生成面试手册和知识体系。',
    path: '/interviews',
    color: '#50d7e6',
  },
]

function getTimeValue(item) {
  return new Date(item?.updatedAt || item?.savedAt || item?.createdAt || 0).getTime() || 0
}

function hasMeaningfulResumeDraft(draft) {
  const data = draft?.data || {}
  return Boolean(
    data.outputText?.trim()
    || data.resumeStrategy
    || data.confirmedStrategy
    || data.customTarget?.trim()
    || data.jdText?.trim()
  )
}

function ContinueWorkspace({
  experiences,
  resumes,
  jobs,
  resumeDraft,
  importDraft,
  navigate,
  showDemo,
  onToggleDemo,
}) {
  const items = useMemo(() => {
    const result = []
    const used = new Set()
    const sortedExperiences = [...experiences].sort((a, b) => getTimeValue(b) - getTimeValue(a))
    const sortedResumes = [...resumes].sort((a, b) => getTimeValue(b) - getTimeValue(a))
    const sortedJobs = [...jobs].sort((a, b) => getTimeValue(b) - getTimeValue(a))
    const pendingExperience = sortedExperiences.find(item => item.status === 'imported')
    const pendingJob = sortedJobs.find(item => !item.interviewManual || !item.knowledgeSystem)

    if (importDraft?.data?.resumeText?.trim()) {
      result.push({
        id: 'import-draft',
        type: '简历导入',
        title: importDraft.data.fileName || '未完成的简历导入',
        detail: `草稿保存于 ${formatDraftTime(importDraft.updatedAt)}`,
        action: '继续导入',
        onClick: () => navigate('/import'),
      })
    }

    if (pendingExperience) {
      used.add(`experience:${pendingExperience.id}`)
      result.push({
        id: `experience:${pendingExperience.id}`,
        type: '经历调研',
        title: pendingExperience.title || [pendingExperience.company, pendingExperience.role].filter(Boolean).join(' · ') || '待调研经历',
        detail: '目前只有简历条目，继续补全项目细节和结果证据',
        action: '继续调研',
        onClick: () => navigate('/experience', {
          state: {
            existingId: pendingExperience.id,
            prefillText: [
              pendingExperience.title,
              pendingExperience.company,
              pendingExperience.role,
              pendingExperience.time,
              pendingExperience.rawInput || pendingExperience.resume_bullets,
            ].filter(Boolean).join('\n'),
          },
        }),
      })
    }

    if (hasMeaningfulResumeDraft(resumeDraft)) {
      result.push({
        id: 'resume-draft',
        type: '简历版本',
        title: resumeDraft.data?.titleInput || resumeDraft.data?.customTarget || resumeDraft.data?.target || '未保存的简历版本',
        detail: `草稿保存于 ${formatDraftTime(resumeDraft.updatedAt)}`,
        action: '继续编辑',
        onClick: () => navigate('/resumes', { state: { mode: 'editor' } }),
      })
    }

    if (pendingJob) {
      used.add(`job:${pendingJob.id}`)
      const missing = !pendingJob.interviewManual ? '面试手册待生成' : '知识体系待补充'
      result.push({
        id: `job:${pendingJob.id}`,
        type: '岗位准备',
        title: pendingJob.title || '未命名岗位',
        detail: missing,
        action: '继续准备',
        onClick: () => navigate(`/jobs/${pendingJob.id}`),
      })
    }

    const fallbacks = [
      sortedResumes[0] && {
        id: `resume:${sortedResumes[0].id}`,
        type: '最近简历',
        title: sortedResumes[0].title || sortedResumes[0].target || '简历版本',
        detail: `最近更新于 ${formatDraftTime(sortedResumes[0].updatedAt || sortedResumes[0].createdAt)}`,
        action: '打开',
        onClick: () => navigate('/resumes', { state: { mode: 'library' } }),
      },
      sortedJobs[0] && {
        id: `job:${sortedJobs[0].id}`,
        type: '最近岗位',
        title: sortedJobs[0].title || '未命名岗位',
        detail: sortedJobs[0].interviewManual ? '已沉淀岗位材料' : 'JD 已保存',
        action: '打开',
        onClick: () => navigate(`/jobs/${sortedJobs[0].id}`),
      },
      sortedExperiences[0] && {
        id: `experience:${sortedExperiences[0].id}`,
        type: '最近经历',
        title: sortedExperiences[0].title || [sortedExperiences[0].company, sortedExperiences[0].role].filter(Boolean).join(' · ') || '经历资产',
        detail: sortedExperiences[0].status === 'imported' ? '待继续调研' : '已沉淀为经历资产',
        action: '查看',
        onClick: () => navigate('/library'),
      },
    ].filter(Boolean)

    fallbacks.forEach(item => {
      if (result.length < 4 && !used.has(item.id) && !result.some(existing => existing.id === item.id)) result.push(item)
    })
    return result.slice(0, 4)
  }, [experiences, resumes, jobs, resumeDraft, importDraft, navigate])

  return (
    <section className="home-workspace">
      <div className="home-workspace-heading">
        <div>
          <h2>继续处理</h2>
        </div>
        <div className="home-workspace-tools">
          <div className="home-workspace-counts">
            <span>{experiences.length} 段经历</span>
            <span>{resumes.length} 份简历</span>
            <span>{jobs.length} 个岗位</span>
          </div>
          <button type="button" className="home-demo-toggle" onClick={onToggleDemo}>
            {showDemo ? '收起功能演示' : '查看功能演示'}
          </button>
        </div>
      </div>
      <div className="home-workspace-list">
        {items.map((item, index) => (
          <button key={item.id} type="button" className="home-workspace-item" onClick={item.onClick}>
            <span className="home-workspace-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="home-workspace-copy">
              <span>{item.type}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="home-workspace-action">{item.action}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { isConfigured, setShowSettings, experiences } = useApp()
  const [showReturningUserDemo, setShowReturningUserDemo] = useState(false)
  const resumes = getResumes()
  const jobs = getJobs()
  const resumeDraft = readDraft(DRAFT_KEYS.resume)
  const importDraft = readDraft(DRAFT_KEYS.resumeImport)
  const hasWorkspace = Boolean(
    experiences.length
    || resumes.length
    || jobs.length
    || hasMeaningfulResumeDraft(resumeDraft)
    || importDraft?.data?.resumeText?.trim()
  )

  return (
    <div className="home-dopamine">
      <main className="home-shell">
        <section className="home-hero">
          <h1 className="home-title">基于真实经历，生成面向不同岗位的简历与面试材料。</h1>
          <div className="home-hero-actions">
            <button onClick={() => navigate('/import')} className="home-primary">
              导入简历
            </button>
            {!isConfigured && (
              <button onClick={() => setShowSettings(true)} className="home-secondary">
                设置 API Key
              </button>
            )}
          </div>
        </section>

        <section className="home-flow" aria-label="使用流程">
          {flowSteps.map((step, index) => (
            <button key={step.title} onClick={() => navigate(step.path)} className="home-flow-step">
              <span className="home-flow-dot" style={{ backgroundColor: step.color }} />
              <span className="home-flow-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </button>
          ))}
        </section>

        {hasWorkspace ? (
          <ContinueWorkspace
            experiences={experiences}
            resumes={resumes}
            jobs={jobs}
            resumeDraft={resumeDraft}
            importDraft={importDraft}
            navigate={navigate}
            showDemo={showReturningUserDemo}
            onToggleDemo={() => setShowReturningUserDemo(current => !current)}
          />
        ) : (
          <HomeProductDemo />
        )}

        {hasWorkspace && showReturningUserDemo && <HomeProductDemo />}

        <p className="home-note">
          数据保存在当前浏览器本地。清理浏览器数据、更换设备或使用隐身模式时可能消失，重要内容建议导出或复制到自己的文档。
        </p>
      </main>
    </div>
  )
}
