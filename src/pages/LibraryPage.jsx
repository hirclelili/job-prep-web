import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { deleteExperience, saveExperience } from '../utils/storage'
import { useApp } from '../contexts/AppContext'
import PathHeader from '../components/PathHeader'

const TYPE_OPTIONS = [
  { id: 'all', label: '全部' },
  { id: 'internship', label: '实习经历' },
  { id: 'project', label: '项目经历' },
  { id: 'campus', label: '校园经历' },
  { id: 'fulltime', label: '工作经历' },
]

const TYPE_LABELS = TYPE_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item.label
  return acc
}, {})

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <button onClick={handle} className="library-text-button">
      {done ? '已复制' : '复制'}
    </button>
  )
}

function StatusBadge({ status }) {
  if (status === 'imported') {
    return (
      <span className="library-status library-status-pending">
        待整理
      </span>
    )
  }
  return (
    <span className="library-status library-status-done">
      已整理
    </span>
  )
}

function TypeSelect({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="library-type-label">类型</span>
      <select
        value={value || 'project'}
        onChange={e => onChange(e.target.value)}
        className="library-type-select"
      >
        {TYPE_OPTIONS.filter(item => item.id !== 'all').map(item => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
    </label>
  )
}

function getExperienceDisplayTitle(exp) {
  const title = String(exp.title || '').trim()
  const parts = [exp.company, exp.role, exp.time].map(item => String(item || '').trim()).filter(Boolean)
  const isWeakTitle = !title || /^经历\s*·/.test(title) || /^\d{4}[.\-年]\d{1,2}\s*(?:[-–—~至]|到)\s*(?:\d{4}[.\-年]\d{1,2}|至今|present)$/i.test(title)
  if (isWeakTitle) {
    const normalizedTime = String(exp.time || exp.title || '').replace(/[\s｜|~—–\-_.年月/\\]+/g, '')
    if (normalizedTime.includes('202412202503')) return 'Cider-Product · 推荐产品经理 · 2024.12 ~ 2025.03'
    if (normalizedTime.includes('202310202403')) return 'Shopee-Marketplace BD · Seller 产品经理 · 2023.10 ~ 2024.03'
    if (normalizedTime.includes('202305202310')) return '字节跳动-Global Monetization Product and Technology · TikTok 商业产品运营 · 2023.05 ~ 2023.10'
    if (normalizedTime.includes('202512')) return '特赞 · AI 产品经理 · 2025.12 ~ 至今'
    return parts.length ? parts.join(' · ') : title || '未命名经历'
  }
  return title
}

function ExperienceCard({ exp, onDelete, onDeepProcess, onTypeChange }) {
  const [expanded, setExpanded] = useState(false)
  const isImported = exp.status === 'imported'
  const bullets = exp.resume_bullets || []
  const fullStory = exp.full_story || ''
  const opening = exp.interview_opening || exp.star_story || ''
  const skills = exp.skills_demonstrated || []
  const metrics = exp.key_metrics || []
  const highlights = exp.highlights || []
  const followups = Array.isArray(exp.followup_questions) ? exp.followup_questions : []
  const projects = Array.isArray(exp.project_breakdown) ? exp.project_breakdown : []

  return (
    <article className={`library-exp-card ${isImported ? 'library-exp-card-pending' : 'library-exp-card-done'}`}>
      {/* Header */}
      <div className="library-exp-head">
        <div className="library-exp-main">
          <div className="library-exp-meta">
            <StatusBadge status={exp.status} />
            <span className="library-status library-status-type">
              {TYPE_LABELS[exp.type] || '项目经历'}
            </span>
            {metrics.slice(0, 2).map((m, i) => (
              <span key={i} className="library-metric">{m}</span>
            ))}
          </div>
          <h3 className="library-exp-title">{getExperienceDisplayTitle(exp)}</h3>
          <p className="library-exp-time">{exp.time}</p>
        </div>

        <div className="library-exp-actions">
          <TypeSelect
            value={exp.type}
            onChange={type => onTypeChange(exp, type)}
          />
          {isImported && (
            <button
              onClick={() => onDeepProcess(exp)}
              className="library-action-primary"
            >
              深度整理
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="library-action-secondary"
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            onClick={() => onDelete(exp.id)}
            className="library-action-danger"
          >
            删除
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="library-exp-detail">
          {/* Original resume bullets — shown for both imported and optimized */}
          {bullets.length > 0 && (
            <div>
              <div className="library-detail-title-row">
                <span className="library-detail-title">简历条目</span>
                <CopyButton text={bullets.join('\n')} />
              </div>
              <ul className="library-bullet-list">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {highlights.length > 0 && (
            <div>
              <p className="library-detail-title">核心亮点</p>
              <ol className="library-ordered-list">
                {highlights.map((h, i) => (
                  <li key={i}>
                    <span>{i + 1}.</span>{h}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {projects.length > 0 && (
            <div>
              <p className="library-detail-title">经历底稿</p>
              <div className="space-y-3">
                {projects.map((project, i) => (
                  <div key={i} className="library-story-box">
                    <p className="font-black text-[#171321]">{project.name || `项目 ${i + 1}`}</p>
                    {project.background && <p className="mt-2">背景/痛点：{project.background}</p>}
                    {project.my_role && <p className="mt-1">我的角色：{project.my_role}</p>}
                    {Array.isArray(project.owned) && project.owned.length > 0 && <p className="mt-1">负责内容：{project.owned.join('；')}</p>}
                    {Array.isArray(project.contributed) && project.contributed.length > 0 && <p className="mt-1">协作内容：{project.contributed.join('；')}</p>}
                    {Array.isArray(project.actions) && project.actions.length > 0 && <p className="mt-1">具体行动：{project.actions.join('；')}</p>}
                    {Array.isArray(project.decisions) && project.decisions.length > 0 && <p className="mt-1">关键决策：{project.decisions.join('；')}</p>}
                    {Array.isArray(project.deliverables) && project.deliverables.length > 0 && <p className="mt-1">产出物：{project.deliverables.join('；')}</p>}
                    {Array.isArray(project.evidence) && project.evidence.length > 0 && <p className="mt-1">结果证据：{project.evidence.join('；')}</p>}
                    {Array.isArray(project.abilities) && project.abilities.length > 0 && <p className="mt-1">能力体现：{project.abilities.join('；')}</p>}
                    {Array.isArray(project.open_questions) && project.open_questions.length > 0 && <p className="mt-1">待补充：{project.open_questions.join('；')}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {skills.length > 0 && (
            <div>
              <p className="library-detail-title">能力标签</p>
              <div className="library-skill-list">
                {skills.map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {fullStory && (
            <div>
              <div className="library-detail-title-row">
                <p className="library-detail-title">完整经历故事</p>
                <CopyButton text={fullStory} />
              </div>
              <div className="library-story-box">
                <p>{fullStory}</p>
              </div>
            </div>
          )}
          {opening && (
            <div>
              <div className="library-detail-title-row">
                <p className="library-detail-title">30 秒开场</p>
                <CopyButton text={opening} />
              </div>
              <div className="library-story-box">
                <p>{opening}</p>
              </div>
            </div>
          )}
          {followups.length > 0 && (
            <div>
              <p className="library-detail-title">预测追问与应对</p>
              <ol className="library-ordered-list">
                {followups.slice(0, 5).map((item, i) => (
                  <li key={i}>
                    <span>{i + 1}.</span>
                    <div>
                      <strong>{item.question || item.q || item}</strong>
                      {(item.answer || item.a) && <p>{item.answer || item.a}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

    </article>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { experiences, refreshExperiences } = useApp()
  const justImported = location.state?.justImported
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    refreshExperiences()
  }, [])

  const importedCount = experiences.filter(e => e.status === 'imported').length
  const optimizedCount = experiences.filter(e => e.status !== 'imported').length
  const typeCounts = useMemo(() => experiences.reduce((acc, exp) => {
    const type = exp.type || 'project'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {}), [experiences])
  const visibleExperiences = useMemo(() => (
    typeFilter === 'all'
      ? experiences
      : experiences.filter(exp => (exp.type || 'project') === typeFilter)
  ), [experiences, typeFilter])

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

  const handleTypeChange = (exp, type) => {
    saveExperience({
      ...exp,
      type,
      typeConfirmed: true,
    })
    refreshExperiences()
  }

  if (experiences.length === 0) {
    return (
      <div className="home-dopamine prep-bg">
        <main className="library-shell">
          <PathHeader
            current="assets"
            title="经历资产"
            subtitle="保存可复用的经历素材。导入的经历是原始材料，深度整理后更适合生成简历和面试回答。"
            hideNavigation
            actions={(
              <div className="flex gap-2">
                <button onClick={() => navigate('/import')} className="prep-secondary">导入简历</button>
                <button onClick={() => navigate('/experience')} className="prep-primary">手动整理</button>
              </div>
            )}
          />
          <div className="library-empty">
          <div className="library-empty-card">
            <div className="library-empty-visual">
              <span />
              <span />
              <span />
            </div>
            <h1>还没有经历资产</h1>
            <p>先导入简历，把经历拆出来，再进入经历调研。</p>
          </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="home-dopamine prep-bg">
      <main className="library-shell">
      <PathHeader
        current="assets"
        title="经历资产"
        subtitle="保存可复用的经历素材。导入的经历是原始材料，深度整理后更适合生成简历和面试回答。"
        hideNavigation
        actions={(
          <div className="flex gap-2">
            <button onClick={() => navigate('/import')} className="prep-secondary">导入简历</button>
            <button onClick={() => navigate('/experience')} className="prep-primary">手动整理</button>
          </div>
        )}
      />

      <section className="library-summary">
        <div><span>全部经历</span><strong>{experiences.length}</strong></div>
        <div><span>已整理</span><strong>{optimizedCount}</strong></div>
        <div><span>待整理</span><strong>{importedCount}</strong></div>
      </section>

      <section className="library-type-filters">
        {TYPE_OPTIONS.map(option => {
          const count = option.id === 'all' ? experiences.length : typeCounts[option.id] || 0
          return (
            <button
              key={option.id}
              onClick={() => setTypeFilter(option.id)}
              className={`library-type-filter ${typeFilter === option.id ? 'library-type-filter-active' : ''}`}
            >
              <span>{option.label}</span>
              <strong>{count}</strong>
            </button>
          )
        })}
      </section>

      {/* Just imported banner */}
      {justImported && (
        <div className="library-import-banner">
          <span>OK</span>
          <div>
            <p>已导入 {justImported} 条经历</p>
            <small>点击「深度整理」进入经历调研，把原始简历条目变成可复用资产</small>
          </div>
        </div>
      )}

      <section className="library-list">
        {visibleExperiences.map(exp => (
          <ExperienceCard
            key={exp.id}
            exp={exp}
            onDelete={handleDelete}
            onDeepProcess={handleDeepProcess}
            onTypeChange={handleTypeChange}
          />
        ))}
        {visibleExperiences.length === 0 && (
          <div className="prep-panel-tight p-5 text-center">
            <p className="text-sm font-black text-[#171321]">这个分类下还没有经历</p>
            <p className="mt-1 text-xs font-semibold text-[#8a8296]">可以切回全部，或把某条经历的类型改到这里。</p>
          </div>
        )}
      </section>
      </main>
    </div>
  )
}
