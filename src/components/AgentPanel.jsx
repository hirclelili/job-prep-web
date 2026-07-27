import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { stripAgentToolBlocks } from '../agent/runtime'
import { useAgent } from '../contexts/AgentContext'
import { getExperiences, getJobs, getProfile, getResumes } from '../utils/storage'

const TOOL_LABELS = {
  'memory.read': '读取记忆',
  'memory.save_note': '保存记忆',
  'memory.update': '更新记忆',
  'profile.read': '读取基本信息',
  'profile.update': '更新基本信息',
  'workspace.read': '读取当前草稿',
  'artifact.publish': '回写结果',
  'experiences.read': '读取经历资产',
  'experiences.save': '保存经历资产',
  'resumes.read': '读取简历版本',
  'resumes.save': '保存简历版本',
  'jobs.read': '读取岗位库',
  'jobs.save': '保存岗位',
  'skill.catalog': '查看能力列表',
  'skill.run': '调用专业技能',
  'skill.chat_turn': '调用对话技能',
}

const QUICK_PROMPTS = [
  '看一下我的经历、简历和岗位库，告诉我最该先补哪一块',
  '基于已有经历资产，帮我规划接下来适合投的方向',
  '我有多个岗位，帮我判断应该优先准备哪个',
]

function buildDashboardState() {
  const profile = getProfile()
  const experiences = getExperiences()
  const resumes = getResumes()
  const jobs = getJobs()
  const deepDived = experiences.filter(exp => exp.status !== 'imported')
  const pendingExperiences = experiences.filter(exp => exp.status === 'imported')
  const jobsWithManual = jobs.filter(job => !!job.interviewManual?.trim())
  const jobsWithKnowledge = jobs.filter(job => !!job.knowledgeSystem?.trim())
  const relatedResumeJobIds = new Set(resumes.map(resume => resume.jobId).filter(Boolean))
  const jobsWithoutResume = jobs.filter(job => !relatedResumeJobIds.has(job.id))
  const jobsWithoutManual = jobs.filter(job => !job.interviewManual?.trim())

  let priority = {
    title: '先导入或整理经历',
    body: '经历资产是后面简历和面试准备的底座。先把原始简历或口述经历放进来，再做深挖。',
    path: '/import',
    action: '去导入简历',
  }

  if (experiences.length > 0 && pendingExperiences.length > 0) {
    priority = {
      title: '先深挖待整理经历',
      body: `还有 ${pendingExperiences.length} 条经历只是原始材料，建议先变成可复用资产。`,
      path: '/library',
      action: '查看经历资产',
    }
  } else if (experiences.length > 0 && resumes.length === 0) {
    priority = {
      title: '生成第一版简历',
      body: '经历资产已经有了，可以先做一版通用简历，再按具体岗位定制。',
      path: '/resumes',
      action: '去简历页',
    }
  } else if (resumes.length > 0 && jobs.length === 0) {
    priority = {
      title: '保存具体岗位',
      body: '下一步把 JD 放进岗位库，后续简历版本和面试材料都绑定到具体岗位。',
      path: '/jobs',
      action: '去岗位库',
    }
  } else if (jobsWithoutResume.length > 0) {
    priority = {
      title: '给岗位生成定制简历',
      body: `${jobsWithoutResume.length} 个岗位还没有关联简历版本，可以先处理优先级最高的岗位。`,
      path: '/jobs',
      action: '打开岗位库',
    }
  } else if (jobsWithoutManual.length > 0) {
    priority = {
      title: '开始面试准备',
      body: `${jobsWithoutManual.length} 个岗位还没有面试手册。进入面试准备后再生成手册和知识体系。`,
      path: '/interviews',
      action: '去面试准备',
    }
  } else if (jobs.length > 0) {
    priority = {
      title: '复盘岗位优先级',
      body: '核心材料已经比较完整，可以让 Agent 帮你比较岗位投入产出和准备顺序。',
      prompt: '看一下我的岗位库和经历资产，帮我判断接下来哪个岗位最值得优先准备。',
      action: '分析优先级',
    }
  }

  return {
    profileReady: !!(profile.name || profile.email || profile.education?.length || profile.skills?.length),
    experiences,
    deepDived,
    pendingExperiences,
    resumes,
    jobs,
    jobsWithManual,
    jobsWithKnowledge,
    priority,
  }
}

function getToolStatusText(event) {
  if (event.status === 'running') return '执行中'
  if (event.status === 'approval') return '待确认'
  if (event.status === 'cancelled') return '已取消'
  if (event.status === 'error') return '失败'
  if (event.result?.published) return '已回写'
  return '完成'
}

export default function AgentPanel() {
  const navigate = useNavigate()
  const {
    open,
    openAgent,
    closeAgent,
    clearAgent,
    messages,
    streamingText,
    loading,
    toolEvents,
    pendingApproval,
    approvePendingTool,
    cancelPendingTool,
    sendAgentMessage,
    draft,
    setDraft,
  } = useAgent()
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const dashboard = useMemo(() => buildDashboardState(), [open, messages.length, loading])

  useEffect(() => {
    if (draft) setInput(draft)
  }, [draft])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolEvents])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [input])

  const submit = () => {
    if (!input.trim() || loading) return
    sendAgentMessage(input)
    setInput('')
  }

  const go = path => {
    closeAgent()
    navigate(path)
  }

  const runPriorityAction = () => {
    if (dashboard.priority.prompt) {
      sendAgentMessage(dashboard.priority.prompt)
      return
    }
    go(dashboard.priority.path)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <>
      <button className="agent-fab" onClick={() => openAgent()} aria-label="打开 AI助手">
        <span>AI</span>
        <strong>助手</strong>
      </button>

      {open && (
        <div className="agent-dock" role="dialog" aria-label="AI助手">
          <div className="agent-card">
            <div className="agent-head">
              <div>
                <p>跨模块控制台</p>
                <h2>AI助手</h2>
              </div>
              <div className="agent-head-actions">
                <button onClick={clearAgent}>清空</button>
                <button onClick={closeAgent} aria-label="关闭">关闭</button>
              </div>
            </div>

            <div className="agent-body">
              {messages.length === 0 && !loading && (
                <div className="agent-dashboard">
                  <section className="agent-diagnosis-card">
                    <div>
                      <p className="agent-eyebrow">当前状态</p>
                      <h3>{dashboard.priority.title}</h3>
                      <span>{dashboard.priority.body}</span>
                    </div>
                    <button onClick={runPriorityAction}>{dashboard.priority.action}</button>
                  </section>

                  <section className="agent-metrics">
                    <div>
                      <strong>{dashboard.deepDived.length}/{dashboard.experiences.length}</strong>
                      <span>经历资产</span>
                    </div>
                    <div>
                      <strong>{dashboard.resumes.length}</strong>
                      <span>简历版本</span>
                    </div>
                    <div>
                      <strong>{dashboard.jobs.length}</strong>
                      <span>岗位</span>
                    </div>
                    <div>
                      <strong>{dashboard.jobsWithManual.length}</strong>
                      <span>面试手册</span>
                    </div>
                  </section>

                  <section className="agent-route-grid">
                    <button onClick={() => go('/library')}>
                      <strong>经历资产</strong>
                      <span>{dashboard.pendingExperiences.length ? `${dashboard.pendingExperiences.length} 条待深挖` : '查看可复用素材'}</span>
                    </button>
                    <button onClick={() => go('/resumes')}>
                      <strong>简历版本</strong>
                      <span>{dashboard.resumes.length ? '修改或生成新版' : '生成第一版简历'}</span>
                    </button>
                    <button onClick={() => go('/jobs')}>
                      <strong>岗位库</strong>
                      <span>{dashboard.jobs.length ? '查看 JD 和材料索引' : '新增具体岗位'}</span>
                    </button>
                    <button onClick={() => go('/interviews')}>
                      <strong>面试准备</strong>
                      <span>{dashboard.jobsWithKnowledge.length ? '查看手册和知识体系' : '进入岗位准备'}</span>
                    </button>
                  </section>

                  <div className="agent-quick-list">
                    {QUICK_PROMPTS.map(prompt => (
                      <button key={prompt} onClick={() => sendAgentMessage(prompt)}>{prompt}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.filter(message => !message.hidden).map((message, index) => (
                <AgentMessage key={`${message.role}-${index}`} message={message} />
              ))}

              {pendingApproval && (
                <div className="agent-approval-card">
                  <p>需要确认后执行</p>
                  <strong>{pendingApproval.label || pendingApproval.tool}</strong>
                  {pendingApproval.reason && <span>{pendingApproval.reason}</span>}
                  <div>
                    <button onClick={approvePendingTool} disabled={loading}>确认执行</button>
                    <button onClick={cancelPendingTool} disabled={loading}>取消</button>
                  </div>
                </div>
              )}

              {toolEvents.length > 0 && (
                <div className="agent-tools">
                  {toolEvents.map(event => (
                    <div key={event.id} className={`agent-tool-pill ${event.status}`}>
                      <span>{TOOL_LABELS[event.tool] || event.tool}</span>
                      <small>{getToolStatusText(event)}</small>
                    </div>
                  ))}
                </div>
              )}

              {loading && (
                <div className="agent-stream">
                  {streamingText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                  ) : (
                    <span>正在读取当前状态…</span>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="agent-input">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="问下一步、岗位取舍，或讨论经历怎么表达"
                disabled={loading}
              />
              <button onClick={submit} disabled={!input.trim() || loading}>发送</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AgentMessage({ message }) {
  const isUser = message.role === 'user'
  const content = isUser ? message.content : stripAgentToolBlocks(message.content)
  if (!content) return null

  return (
    <div className={`agent-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="agent-avatar">{isUser ? '你' : 'AI'}</div>
      <div className="agent-bubble">
        {isUser ? (
          <p>{content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
