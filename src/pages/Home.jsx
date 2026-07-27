import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs, getProfile, getResumes } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

const outcomes = [
  {
    title: '经历档案',
    description: '每段经历的完整事实、项目细节、简历表达和面试素材。',
    note: '可以持续补充，也可以只修改其中一部分',
    colors: ['#55dff1', '#ff5cc8', '#fff04a'],
    visual: 'experience',
  },
  {
    title: '简历版本',
    description: '基于同一套经历，按通用方向、岗位方向或具体 JD 生成不同版本。',
    note: '正文可编辑，支持 Word、PDF 和 PNG 导出',
    colors: ['#ff5cc8', '#b6ffdd', '#725cff'],
    visual: 'delivery',
  },
  {
    title: '岗位档案',
    description: '为每个 JD 保存对应简历、面试手册和知识体系。',
    note: '多个岗位彼此独立，需要时随时继续准备',
    colors: ['#8c6bff', '#50d7e6', '#ffe66d'],
    visual: 'interview',
  },
]

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

function ThemeVisual({ type, colors }) {
  if (type === 'experience') {
    return (
      <div className="home-visual home-visual-experience" aria-hidden="true">
        <div className="home-doc-card">
          <span className="home-doc-line home-doc-line-strong" />
          <span className="home-doc-line" />
          <span className="home-doc-line home-doc-line-short" />
          <div className="home-tag-row">
            <span style={{ backgroundColor: colors[0] }} />
            <span style={{ backgroundColor: colors[2] }} />
          </div>
        </div>
        <div className="home-question-card" style={{ backgroundColor: colors[1] }}>
          <span>Q</span>
        </div>
        <div className="home-star-card" style={{ backgroundColor: colors[2] }}>
          <span>S</span>
          <span>T</span>
          <span>A</span>
          <span>R</span>
        </div>
      </div>
    )
  }

  if (type === 'delivery') {
    return (
      <div className="home-visual home-visual-delivery" aria-hidden="true">
        <div className="home-target-card" style={{ backgroundColor: colors[0] }}>
          <span className="home-target-ring" />
          <span className="home-target-dot" />
        </div>
        <div className="home-resume-stack">
          <span className="home-stack-back" />
          <span className="home-stack-front">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="home-jd-chip" style={{ backgroundColor: colors[2] }}>
          JD
        </div>
      </div>
    )
  }

  return (
    <div className="home-visual home-visual-interview" aria-hidden="true">
      <div className="home-manual-card" style={{ backgroundColor: colors[0] }}>
        <span />
        <span />
        <span />
      </div>
      <div className="home-chat-card" style={{ backgroundColor: colors[1] }}>
        <span className="home-chat-line" />
        <span className="home-chat-line home-chat-line-short" />
      </div>
      <div className="home-knowledge-map">
        <span className="home-node home-node-a" style={{ backgroundColor: colors[2] }} />
        <span className="home-node home-node-b" style={{ backgroundColor: colors[1] }} />
        <span className="home-node home-node-c" style={{ backgroundColor: colors[0] }} />
      </div>
    </div>
  )
}

function OutcomeTile({ outcome }) {
  return (
    <article className="home-tile" style={{ '--tile-color': outcome.colors[0], '--tile-soft': outcome.colors[1] }}>
      <div className="home-tile-main">
        <div className="home-tile-top">
          <ThemeVisual type={outcome.visual} colors={outcome.colors} />
        </div>
        <div>
          <h2 className="home-tile-title">{outcome.title}</h2>
          <p className="home-tile-desc">{outcome.description}</p>
          <p className="home-outcome-note">{outcome.note}</p>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { isConfigured, setShowSettings, experiences } = useApp()
  const resumes = getResumes()
  const jobs = getJobs()
  const profile = getProfile()
  const hasProfile = !!(profile.name || profile.email || profile.phone)

  return (
    <div className="home-dopamine">
      <main className="home-shell">
        <section className="home-hero">
          <div>
            <h1 className="home-title">基于真实经历，生成面向不同岗位的简历与面试材料。</h1>
          </div>
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

        <section className="home-grid">
          {outcomes.map(outcome => (
            <OutcomeTile key={outcome.title} outcome={outcome} />
          ))}
        </section>

        <section className="home-footer-row">
          <div className="home-stats">
            {[
              ['经历', experiences.length],
              ['简历', resumes.length],
              ['岗位', jobs.length],
              ['信息', hasProfile ? '已识别' : '未整理'],
            ].map(([label, value]) => (
              <div key={label} className="home-stat">
                <p>{label}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <p className="home-note">
            数据保存在当前浏览器本地。清理浏览器数据、更换设备或使用隐身模式时可能消失，重要内容建议导出或复制到自己的文档。
          </p>
        </section>
      </main>
    </div>
  )
}
