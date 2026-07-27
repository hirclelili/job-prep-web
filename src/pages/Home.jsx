import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs, getProfile, getResumes } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

const modules = [
  {
    title: '我的经历',
    action: '第一步',
    description: '导入简历，深挖单段经历，沉淀可复用的经历资产。',
    path: '/library',
    colors: ['#55dff1', '#ff5cc8', '#fff04a'],
    visual: 'experience',
    entries: [
      { label: '简历导入', path: '/import' },
      { label: '经历调研', path: '/experience' },
      { label: '经历资产', path: '/library' },
    ],
  },
  {
    title: '投递准备',
    action: '第二步',
    description: '判断岗位方向，生成可以投递的简历版本。',
    path: '/resumes',
    colors: ['#ff5cc8', '#b6ffdd', '#725cff'],
    visual: 'delivery',
    entries: [
      { label: '选岗位方向', path: '/directions' },
      { label: '简历版本', path: '/resumes' },
    ],
  },
  {
    title: '岗位',
    action: '第三步',
    description: '保存多个 JD，把每个岗位对应的简历版本和面试材料沉淀成索引。',
    path: '/jobs',
    colors: ['#8c6bff', '#50d7e6', '#ffe66d'],
    visual: 'interview',
    entries: [
      { label: '岗位列表', path: '/jobs' },
      { label: 'JD 详情', path: '/jobs' },
      { label: '岗位材料', path: '/jobs' },
    ],
  },
  {
    title: '面试准备',
    action: '第四步',
    description: '选择具体岗位，进入面试手册和知识体系的生成工作区。',
    path: '/interviews',
    colors: ['#50d7e6', '#b6ffdd', '#ff5cc8'],
    visual: 'interview',
    entries: [
      { label: '选择岗位', path: '/interviews' },
      { label: '面试手册', path: '/interviews' },
      { label: '知识体系', path: '/interviews' },
    ],
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

function ModuleTile({ module, index }) {
  const navigate = useNavigate()

  return (
    <article className="home-tile" style={{ '--tile-color': module.colors[0], '--tile-soft': module.colors[1] }}>
      <button onClick={() => navigate(module.path)} className="home-tile-main">
        <div className="home-tile-top">
          <span className="home-tile-index">{String(index + 1).padStart(2, '0')}</span>
          <ThemeVisual type={module.visual} colors={module.colors} />
        </div>
        <div>
          <p className="home-tile-action">{module.action}</p>
          <h2 className="home-tile-title">{module.title}</h2>
          <p className="home-tile-desc">{module.description}</p>
        </div>
      </button>

      <div className="home-entry-grid">
        {module.entries.map(entry => (
          <button key={entry.label} onClick={() => navigate(entry.path)} className="home-entry">
            {entry.label}
          </button>
        ))}
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
            <h1 className="home-title">把经历，变成机会。</h1>
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
          {modules.map((module, index) => (
            <ModuleTile key={module.title} module={module} index={index} />
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
