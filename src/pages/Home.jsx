import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs, getResumes } from '../utils/storage'
import { DRAFT_KEYS, formatDraftTime, readDraft } from '../utils/draftStorage'
import { useApp } from '../contexts/AppContext'

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

const demoStages = [
  { label: '原始条目', color: '#55dff1' },
  { label: '经历调研', color: '#ff5cc8' },
  { label: '多场景复用', color: '#fff04a' },
]

const demoOutputs = {
  product: {
    label: '产品方向简历',
    text: '围绕新用户关键行为完成率低的问题，拆解首周用户路径并定位任务链路与触达时机，设计分层任务和对照实验方案，通过关键行为转化率与留存指标验证策略。',
  },
  operation: {
    label: '运营方向简历',
    text: '按新用户激活状态建立分层运营策略，设计首周任务、阶段触达与激励机制，并结合任务完成率和留存指标持续复盘。',
  },
  interview: {
    label: '面试回答',
    text: '当时新用户注册后关键行为完成率偏低。我先拆解首周路径，发现问题不只是激励不足，而是任务过长、触达时机不准确。随后按激活状态分层，重构首周任务并设置对照实验，用任务完成率、关键行为转化率和次日留存判断方案是否有效。',
  },
}

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

function ExperienceReuseDemo() {
  const [stage, setStage] = useState(0)
  const [outputKey, setOutputKey] = useState('product')
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (paused || reducedMotion) return undefined
    const timer = window.setInterval(() => setStage(current => (current + 1) % demoStages.length), 4800)
    return () => window.clearInterval(timer)
  }, [paused, reducedMotion])

  useEffect(() => {
    if (stage !== 2 || paused || reducedMotion) return undefined
    const keys = Object.keys(demoOutputs)
    const timer = window.setInterval(() => {
      setOutputKey(current => keys[(keys.indexOf(current) + 1) % keys.length])
    }, 2700)
    return () => window.clearInterval(timer)
  }, [stage, paused, reducedMotion])

  return (
    <section
      className="home-demo"
      aria-label="经历复用示例"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="home-demo-heading">
        <div>
          <span className="home-demo-kicker">示例演示</span>
          <h2>一段经历，如何变成可复用的求职素材</h2>
          <p>不是替你编内容，而是把已有经历里的问题、判断、行动和证据问清楚。</p>
        </div>
        <div className="home-demo-tabs" role="tablist" aria-label="演示阶段">
          {demoStages.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={stage === index}
              className={stage === index ? 'is-active' : ''}
              onClick={() => setStage(index)}
              style={{ '--stage-color': item.color }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`home-demo-canvas home-demo-stage-${stage}`} key={stage}>
        {stage === 0 && (
          <div className="home-demo-raw">
            <div className="home-demo-resume">
              <span className="home-demo-section-name">经历</span>
              <div className="home-demo-resume-title">
                <strong>某内容平台</strong>
                <span>用户运营</span>
              </div>
              <p>负责新用户活动运营，通过任务激励提升用户活跃。</p>
            </div>
            <div className="home-demo-observation">
              <span>目前能看见什么</span>
              <strong>做了活动</strong>
              <strong>用了任务激励</strong>
              <p>但还不知道为什么做、你如何判断、具体做了什么，也没有结果证据。</p>
            </div>
          </div>
        )}

        {stage === 1 && (
          <div className="home-demo-research">
            <div className="home-demo-question">
              <span>AI 本轮追问</span>
              <strong>新用户当时卡在哪个关键行为？你怎么判断问题出在任务路径，而不只是奖励力度？</strong>
            </div>
            <div className="home-demo-facts">
              {[
                ['业务问题', '新用户注册后没有完成关键行为，后续留存较低。'],
                ['个人判断', '问题不只是奖励不足，而是首周任务路径过长、触达时机不准确。'],
                ['关键行动', '重构首周任务链路，按激活状态分层，并为不同阶段配置触达和激励。'],
                ['验证方式', '用任务完成率、关键行为转化率、次日留存和对照实验验证策略。'],
              ].map(([label, text], index) => (
                <div key={label} className="home-demo-fact" style={{ '--fact-index': index }}>
                  <span>{label}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="home-demo-output">
            <div className="home-demo-evidence">
              <span>同一组确认事实</span>
              {['新用户关键行为', '首周任务路径', '用户状态分层', '对照实验与留存'].map(item => (
                <strong key={item}>{item}</strong>
              ))}
            </div>
            <div className="home-demo-version">
              <div className="home-demo-output-tabs" role="tablist" aria-label="输出类型">
                {Object.entries(demoOutputs).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={outputKey === key}
                    className={outputKey === key ? 'is-active' : ''}
                    onClick={() => setOutputKey(key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="home-demo-output-copy" key={outputKey}>
                <span>{demoOutputs[outputKey].label}</span>
                <p>{demoOutputs[outputKey].text}</p>
              </div>
              <p className="home-demo-output-note">事实不变，只调整选材、重点和表达方式。</p>
            </div>
          </div>
        )}
      </div>

      <div className="home-demo-progress" aria-hidden="true">
        <span key={stage} style={{ '--progress-duration': reducedMotion ? '0s' : '4.8s' }} />
      </div>
    </section>
  )
}

function ContinueWorkspace({ experiences, resumes, jobs, resumeDraft, importDraft, navigate }) {
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
          <span>继续处理</span>
          <h2>回到上次停下的位置</h2>
        </div>
        <div className="home-workspace-counts">
          <span>{experiences.length} 段经历</span>
          <span>{resumes.length} 份简历</span>
          <span>{jobs.length} 个岗位</span>
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
          />
        ) : (
          <ExperienceReuseDemo />
        )}

        <p className="home-note">
          数据保存在当前浏览器本地。清理浏览器数据、更换设备或使用隐身模式时可能消失，重要内容建议导出或复制到自己的文档。
        </p>
      </main>
    </div>
  )
}
