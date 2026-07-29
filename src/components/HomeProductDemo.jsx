import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Joyride } from 'react-joyride'
import { useNavigate } from 'react-router-dom'
import AgentWorkspacePanel from './AgentWorkspacePanel'
import OutputPanel from './OutputPanel'
import {
  ExperienceDossierProgress,
  ExperienceResearchWorkspace,
} from './experience/ExperienceWorkspaceUI'
import { buildResumeDocumentHtml } from '../utils/resumeExport'

const stages = [
  { id: 'import', label: '导入简历', step: 0 },
  { id: 'research', label: '经历调研', step: 2 },
  { id: 'dossier', label: '经历档案', step: 8 },
  { id: 'resume', label: '简历版本', step: 9 },
  { id: 'job', label: '岗位', step: 11 },
  { id: 'interview', label: '面试准备', step: 13 },
]

const sourceMessage = {
  role: 'user',
  content: '负责企业客户工单协同流程优化，完成工单列表、详情页和状态提醒设计。',
}

const businessQuestion = {
  role: 'assistant',
  content: `## 本轮问题

当时推动工单流程优化，最主要的问题是什么？

**为什么问：** 先确认真实业务问题，后面才能判断你的产品决策和贡献。

选项：

A. 处理状态不透明，客户频繁追问，客服依赖群聊同步

B. 不同客户团队的处理流程不统一，产品维护成本较高

C. 申请信息分散在多张表格中，审核容易遗漏

D. 其他，我自己补充`,
}

const actionQuestion = {
  role: 'assistant',
  content: `## 本轮问题

你在方案设计中亲自主导了哪些部分？

**为什么问：** 把团队完成的项目，与真正能证明你能力的个人判断分开。

选项（可多选）：

A. 梳理工单创建至关闭的完整流程和阶段状态

B. 独立设计工单列表、详情页和异常提示

C. 与客服团队统一处理口径并推动方案落地

D. 其他，我自己补充`,
}

const evidenceQuestion = {
  role: 'assistant',
  content: `## 本轮问题

方案上线后，哪些结果是你能够确认的？

**为什么问：** 结果不只包含数字，上线范围、交付物和业务反馈也都是有效证据。

选项（可多选）：

A. 新版工单协同流程正式上线

B. 关键处理状态实现线上可视化

C. 客服不再依赖群聊手动同步进度

D. 暂时没有可确认的量化数据`,
}

const dossierContent = `## 经历总览

### 基础信息

示例科技｜B端产品经理实习生｜2025.03 – 2025.07

### 经历定位

围绕企业客户问题处理效率与客服协同，完成从业务流程梳理、状态体系设计到核心页面交付的完整产品工作。

### 简历表达

- 梳理企业工单创建至关闭全链路，统一关键处理状态和流转条件，独立设计工单列表、详情页及异常提示，推动协同流程标准化与关键节点可视化。

## 项目档案：企业客户工单协同流程

### 业务现场与目标

客户提交问题后无法判断处理进度，需要反复向客服追问；客服侧依赖群聊同步状态，信息更新不及时且容易遗漏。项目目标是把问题创建、分派、处理中、待确认和关闭串成可追踪的线上流程。

### 我的职责

我负责工单协同流程的产品方案设计，主导流程图、阶段状态图和核心页面方案；客服处理规则由业务团队提供，我负责将其转化为页面信息和状态流转逻辑。

### 行动与决策链

先将问题拆为“客户不知道进度”和“客服缺少统一状态”两部分；随后梳理工单创建至关闭全链路，定义待分派、处理中、待确认和已关闭等关键状态；最后独立设计工单列表与详情页，让客户看到当前阶段、待办事项和历史记录。

### 结果与证据

新版工单协同流程完成上线，核心处理节点实现线上可视化。具体追问量和处理周期变化仍待补充。

## 面试故事：企业客户工单协同流程

### 详细面试故事

这个项目最初的问题并不是缺少一个页面，而是客户和客服对“问题处理到哪一步”没有统一认知。我先还原完整业务流程，再把线下处理动作抽象成产品状态，最终用列表页承载多条工单、用详情页解释单条工单的当前进度和下一步动作。`

const interviewManual = `# 第一章：岗位与候选人匹配

## 1. 岗位核心任务

该岗位重点考察复杂业务流程抽象、B端产品方案设计和跨团队推动能力。你的工单协同经历可以证明流程标准化能力，活动配置工作台可以证明多角色协同与产品落地能力。

# 第二章：经历使用策略

## 1. 主打经历

优先讲企业客户工单协同流程。回答重点不是“画了两个页面”，而是如何从客户频繁追问和客服群聊同步中定位状态体系问题，并将处理规则转化为线上流程。

# 第三章：面试问题预测

## 问题 1：你是如何梳理复杂业务流程的？

**考察点：** 问题拆解、流程抽象和产品判断。

**应答策略：** 按业务对象、关键节点、异常分支和状态流转四层展开，并说明为什么记录页与详情页承担不同任务。

## 问题 2：你如何判断方案真正解决了问题？

**考察点：** 结果意识与证据意识。

**应答策略：** 区分已经确认的上线事实、可观察的流程变化和仍需补充的量化指标，不虚构数据。`

const knowledgeSystem = `# B 端流程与状态体系

## 1. 业务流程建模

**一句话理解：** 把多人在线下完成的业务动作，整理成系统能够识别、约束和追踪的步骤。

**概念说明：** 先明确参与角色、业务对象和关键节点，再补充正常路径、异常分支和回退机制。流程图描述“发生什么”，状态图描述“对象当前处于什么状态以及如何变化”。

**典型应用场景：** 客户工单、订单履约、内容审核、项目验收。

**在这个岗位里怎么用：** 面试中需要解释如何将客服处理规则转化为客户可理解的页面状态，以及如何避免前后端对状态含义理解不一致。

# 多角色协同产品设计

## 1. 角色、权限与信息差

**一句话理解：** 不同角色在同一流程里拥有不同任务、决策权和信息需求。

**概念说明：** 产品设计不能只画统一页面，需要分别确认谁发起、谁审核、谁修改、谁只读，以及每个角色在什么节点需要收到什么信息。

**典型应用场景：** 市场、法务、设计联合审核；客户与客服协同；企业审批流。

**在这个岗位里怎么用：** 用工单协同流程和活动配置工作台说明你如何处理外部客户与内部团队之间的信息差。`

const resumeContent = `## 教育背景

示例大学｜信息管理 本科｜2022.09 – 2026.06

## 实习经历

示例科技｜B端产品经理实习生｜2025.03 – 2025.07

- 梳理企业工单创建至关闭全链路，统一关键处理状态和流转条件，独立设计工单列表、详情页及异常提示，推动协同流程标准化与关键节点可视化。
- 针对跨团队分派效率较低的问题，设计优先级规则、超时提醒及处理人变更记录，帮助客服团队减少重复确认。

## 项目经历

营销活动配置工作台｜产品设计

- 将活动创建、内容审核和发布检查整合至统一平台，设计模板复用与审核意见汇总机制，支持市场、法务和设计多角色线上协同。`

const resumeProfile = {
  name: '小序同学',
  phone: '000 0000 0000',
  email: 'demo@sample.com',
  city: '示例城市',
  education: [],
  skills: [],
  links: [],
}

function sceneForStep(step) {
  if (step < 2) return 'import'
  if (step < 8) return 'research'
  if (step < 9) return 'dossier'
  if (step < 11) return 'resume'
  if (step < 13) return 'job'
  return 'interview'
}

function cueForStep(step) {
  const cues = [
    ['导入简历', '上传 PDF 或粘贴文本，先建立个人信息和经历清单'],
    ['拆分经历', '把简历中的实习和项目拆成独立条目，再选择一段深入调研'],
    ['读取经历', '先识别这段描述里缺少的关键信息'],
    ['确认事实', '选择真实业务问题，不让 AI 自由猜测'],
    ['实时沉淀', '新确认的信息立即进入右侧经历档案'],
    ['继续深挖', '再确认你的职责边界、判断和具体行动'],
    ['确认行动', '支持多选，区分你主导、参与和协作的部分'],
    ['补齐证据', '区分上线事实、业务反馈与待补数据'],
    ['生成档案', '把确认事实整理成简历表达和面试故事'],
    ['制定策略', '先决定哪些经历主打、保留或弱化'],
    ['生成简历', '严格按确认策略生成可编辑的一页简历'],
    ['保存岗位', 'JD、简历版本和面试材料归到同一岗位'],
    ['开始准备', '从岗位页进入该岗位专属准备空间'],
    ['拆解岗位', '同时读取 JD、简历版本和全部经历资产'],
    ['面试手册', '生成匹配分析、经历策略和问题预测'],
    ['知识体系', '补齐岗位涉及的核心概念与应用场景'],
  ]
  return cues[Math.min(step, cues.length - 1)]
}

const tourTargets = [
  {
    target: '.product-demo-import-actions',
    spotlightTarget: '.product-demo-import-dropzone',
    placement: 'top',
  },
  {
    target: '.product-demo-imported-card:first-child',
    spotlightTarget: '.product-demo-imported-card:first-child',
    placement: 'top',
  },
  {
    target: '.product-demo-research-camera .experience-workspace-chat-body > div > div:last-child',
    spotlightTarget: '.product-demo-research-camera .space-y-4 > div:first-child > div:last-child > div:first-child',
    placement: 'top',
  },
  { target: '.product-demo-research-camera .experience-choice-grid > button:first-child', placement: 'right' },
  { target: '.product-demo-research-camera .experience-choice-grid > button:first-child', placement: 'right' },
  { target: '.product-demo-research-camera .experience-workspace-dossier', placement: 'left' },
  { target: '.product-demo-research-camera .experience-choice-grid > button:first-child', placement: 'right' },
  { target: '.product-demo-research-camera .experience-workspace-dossier', placement: 'left' },
  {
    target: '.product-demo-page-toolbar',
    spotlightTarget: '.product-demo-output-body',
    placement: 'bottom',
  },
  { target: '.product-demo-strategy-stack', placement: 'right' },
  {
    target: '.product-demo-resume-toolbar > div:last-child',
    spotlightTarget: '.product-demo-resume-real > main',
    placement: 'left',
  },
  { target: '.product-demo-job-head', placement: 'top' },
  { target: '.product-demo-prepare-target', placement: 'left' },
  { target: '.product-demo-interview-real > aside', placement: 'right' },
  {
    target: '.product-demo-interview-tabs',
    spotlightTarget: '.product-demo-interview-real > main',
    placement: 'bottom',
  },
  {
    target: '.product-demo-interview-tabs',
    spotlightTarget: '.product-demo-interview-real > main',
    placement: 'bottom',
  },
]

function buildTourSteps() {
  return tourTargets.map((config, index) => {
    const [title, content] = cueForStep(index)
    return {
      id: `product-demo-step-${index}`,
      ...config,
      title: `${String(index + 1).padStart(2, '0')} · ${title}`,
      content,
      data: { scene: sceneForStep(index) },
      spotlightPadding: index === 10 ? 8 : 12,
      spotlightRadius: 14,
      skipBeacon: true,
    }
  })
}

function DemoGuideTooltip({
  index,
  isLastStep,
  size,
  step,
  tooltipProps,
  onBack,
  onClose,
  onNext,
}) {
  return (
    <div
      {...tooltipProps}
      className={`product-demo-guide-tooltip is-${step.data?.scene || 'research'}`}
    >
      <div className="product-demo-guide-tooltip-head">
        <span>{step.title}</span>
        <button type="button" onClick={onClose} aria-label="关闭引导">×</button>
      </div>
      <p>{step.content}</p>
      <div className="product-demo-guide-tooltip-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / size) * 100}%` }} />
      </div>
      <div className="product-demo-guide-tooltip-foot">
        <span>{index + 1} / {size}</span>
        <div>
          {index > 0 && (
            <button type="button" className="is-back" onClick={onBack}>上一步</button>
          )}
          {!isLastStep && (
            <button type="button" className="is-next" onClick={onNext}>下一步</button>
          )}
        </div>
      </div>
      {isLastStep && (
        <button
          type="button"
          className="product-demo-guide-start"
          onClick={onNext}
        >
          现在开始使用
        </button>
      )}
    </div>
  )
}

function ImportScene({ parsed = false }) {
  if (parsed) {
    const experiences = [
      {
        type: '实习经历',
        title: '示例科技 · B端产品经理实习生',
        time: '2025.03 – 2025.07',
        detail: '企业客户工单协同流程、状态体系与核心页面设计',
      },
      {
        type: '项目经历',
        title: '营销活动配置工作台 · 产品设计',
        time: '2024.10 – 2025.01',
        detail: '活动创建、内容审核与多角色协作流程',
      },
      {
        type: '校园经历',
        title: '校园创新创业项目 · 项目负责人',
        time: '2023.09 – 2024.05',
        detail: '项目策划、团队协作与成果展示',
      },
    ]

    return (
      <div className="product-demo-imported-scene">
        <header>
          <div>
            <span>我的经历</span>
            <h3>经历资产</h3>
            <p>简历已经拆分为独立经历，可以逐段补充和深度整理。</p>
          </div>
          <button type="button" className="prep-secondary">重新导入</button>
        </header>
        <div className="product-demo-imported-summary">
          <strong>已识别 3 段经历</strong>
          <span>3 段待整理</span>
        </div>
        <section className="product-demo-import-result">
          {experiences.map((experience, index) => (
            <article
              key={experience.title}
              className={`product-demo-imported-card ${index === 0 ? 'is-selected' : ''}`}
            >
              <div>
                <span>待整理</span>
                <em>{experience.type}</em>
                <h4>{experience.title}</h4>
                <time>{experience.time}</time>
                <p>{experience.detail}</p>
              </div>
              <button type="button" className="prep-primary">深度整理</button>
            </article>
          ))}
        </section>
      </div>
    )
  }

  return (
    <div className="product-demo-import-scene">
      <div className="product-demo-import-heading">
        <span>我的经历</span>
        <h3>导入简历</h3>
        <p>先从现有简历建立基础资料，之后再逐段补充真实细节。</p>
      </div>
      <div className="product-demo-import-dropzone">
        <div className="product-demo-import-file">
          <b>PDF</b>
          <span>个人简历.pdf</span>
        </div>
        <strong>上传一份现有简历</strong>
        <p>系统会识别个人信息、教育背景，以及实习、项目和校园经历。</p>
        <div className="product-demo-import-actions">
          <button type="button" className="prep-primary">上传 PDF</button>
          <button type="button" className="prep-secondary">粘贴文本</button>
        </div>
      </div>
      <div className={`product-demo-import-result ${parsed ? 'is-parsed' : ''}`}>
        <span>{parsed ? '已识别 3 段经历' : '解析后'}</span>
        <strong>{parsed ? '选择一段经历开始深度整理' : '生成可继续调研的经历清单'}</strong>
        <button type="button" className={parsed ? 'is-selected' : ''}>
          <i />
          <p><b>示例科技</b><small>B端产品经理实习生</small></p>
          {parsed && <em>深度整理</em>}
        </button>
        <button type="button">
          <i />
          <p><b>营销活动配置工作台</b><small>项目经历</small></p>
          {parsed && <em>深度整理</em>}
        </button>
        <button type="button">
          <i />
          <p><b>校园创新创业项目</b><small>校园经历</small></p>
          {parsed && <em>深度整理</em>}
        </button>
      </div>
    </div>
  )
}

function DemoProgress({ step }) {
  const businessReady = step >= 3
  const actionReady = step >= 5
  return (
    <ExperienceDossierProgress
      progress={actionReady ? 68 : businessReady ? 44 : 15}
      fields={[
        {
          label: '基础信息',
          value: '示例科技 · B端产品经理实习生 · 2025.03 – 2025.07',
          confirmed: true,
        },
        {
          label: '业务背景与目标',
          value: businessReady
            ? '客户无法判断处理进度；客服依赖群聊同步状态。'
            : '待确认',
          confirmed: businessReady,
          highlight: step === 3,
        },
        {
          label: '个人贡献与行动',
          value: actionReady
            ? '主导流程与状态梳理，独立设计工单列表和详情页。'
            : '待确认',
          confirmed: actionReady,
          highlight: step === 5,
        },
        {
          label: '结果与证据',
          value: actionReady ? '流程已上线，量化结果待补充。' : '待补充',
          confirmed: actionReady,
        },
      ]}
      note={businessReady ? '刚刚确认的内容已记录' : ''}
    />
  )
}

function ResearchScene({ step, onChoice, onReplay }) {
  const messages = useMemo(() => {
    const next = [sourceMessage]
    if (step >= 1) next.push(businessQuestion)
    if (step >= 3) {
      next.push({
        role: 'user',
        content: 'A. 处理状态不透明，客户频繁追问，客服依赖群聊同步',
      })
      next.push(actionQuestion)
    }
    if (step >= 5) {
      next.push({
        role: 'user',
        content: 'A、B、C：我负责流程和状态梳理、核心页面设计，并与客服统一处理口径',
      })
      next.push(evidenceQuestion)
    }
    return next
  }, [step])

  return (
    <div className="product-demo-research-camera">
      <ExperienceResearchWorkspace
        action={<button type="button" className="prep-ghost" onClick={onReplay}>新调研</button>}
        chat={(
          <AgentWorkspacePanel
            context={{}}
            placeholder="描述经历，或回答助手的问题…"
            emptyTitle="描述一段经历，助手会继续追问"
            emptyText="它会逐轮确认关键信息，再生成完整经历档案。"
            demoState={{
              messages,
              loading: step === 0,
              streamingText: '',
              toolEvents: [],
              pendingApproval: null,
              onChoiceSelect: onChoice,
              onSubmit: () => {},
              onClear: onReplay,
            }}
          />
        )}
        dossier={(
          <div className="experience-guide-shared">
            <DemoProgress step={step} />
            <div className="experience-guide-next">
              <strong>继续回答左侧问题</strong>
              <p>新确认的事实会按项目累计到右侧。</p>
              <button type="button" className="prep-ghost">查看经历资产</button>
            </div>
          </div>
        )}
      />
    </div>
  )
}

function DossierScene() {
  return (
    <div className="product-demo-output-scene">
      <div className="product-demo-page-toolbar">
        <div>
          <span>我的经历</span>
          <strong>示例科技 · B端产品经理实习生</strong>
          <p>完整经历档案</p>
        </div>
        <div>
          <button type="button" className="prep-secondary">导出</button>
          <button type="button" className="prep-primary">保存为经历资产</button>
        </div>
      </div>
      <div className="product-demo-output-body">
        <OutputPanel content={dossierContent} variant="experience" />
      </div>
    </div>
  )
}

function ResumeScene({ generated, onGenerate }) {
  const resumeHtml = useMemo(() => buildResumeDocumentHtml({
    title: 'B端产品经理简历',
    content: resumeContent,
    profile: resumeProfile,
  }), [])

  return (
    <div className="product-demo-resume-real">
      <aside>
        <span className="prep-kicker">简历版本</span>
        <h3>B端产品经理</h3>
        <p>AI 已评估全部经历，并按目标方向调整每段经历的重点与分量。</p>
        <div className="product-demo-strategy-stack">
          <div className="product-demo-real-strategy">
            <span>主打经历</span>
            <strong>企业客户工单协同</strong>
            <small>流程拆解 · 状态体系 · 客服协同</small>
          </div>
          <div className="product-demo-real-strategy">
            <span>保留经历</span>
            <strong>营销活动配置工作台</strong>
            <small>多角色工作流 · 产品落地</small>
          </div>
        </div>
        <button
          type="button"
          className={`prep-primary ${!generated ? 'is-demo-pressed' : ''}`}
          onClick={onGenerate}
        >
          {generated ? '保存版本' : '确认配置，生成简历'}
        </button>
      </aside>
      <main>
        <div className="product-demo-resume-toolbar">
          <div>
            <strong>{generated ? 'B端产品经理简历' : '选材策略预览'}</strong>
            <span>{generated ? '可直接编辑、保存和导出' : '确认后生成完整简历'}</span>
          </div>
          {generated && (
            <div>
              <button type="button" className="prep-secondary">编辑</button>
              <button type="button" className="prep-primary">导出</button>
            </div>
          )}
        </div>
        {generated ? (
          <iframe title="演示简历预览" srcDoc={resumeHtml} />
        ) : (
          <div className="product-demo-strategy-preview">
            <span>01</span>
            <div>
              <strong>示例科技 · B端产品经理实习生</strong>
              <p>放在实习经历首位，使用 2 条 bullet，重点突出复杂流程抽象与产品交付。</p>
            </div>
            <span>02</span>
            <div>
              <strong>营销活动配置工作台</strong>
              <p>保留 1 条 bullet，强调多角色协同和端到端工作流设计。</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function JobScene({ pressed, onPrepare }) {
  return (
    <div className="product-demo-job-real">
      <section className="prep-panel product-demo-job-head">
        <div>
          <span className="prep-kicker">岗位材料页</span>
          <h3>目标公司 · B端产品经理</h3>
          <div className="product-demo-job-status">
            <span>JD 已保存</span>
            <span>简历版本 1 版</span>
            <span>面试手册 未生成</span>
            <span>知识体系 未生成</span>
          </div>
        </div>
        <div>
          <button type="button" className="prep-secondary">生成简历版本</button>
          <button
            type="button"
            className={`prep-primary product-demo-prepare-target ${pressed ? 'is-demo-pressed' : ''}`}
            onClick={onPrepare}
          >
            开始面试准备
          </button>
        </div>
        <button type="button" className="product-demo-jd-fold">
          <span>
            <b>JD 原文</b>
            负责企业协作产品方案设计，推动复杂业务流程在线化与标准化……
          </span>
          <em>展开</em>
        </button>
      </section>
      <section className="prep-panel product-demo-job-main">
        <div>
          <strong>面试手册</strong>
          <span>还没有生成</span>
        </div>
        <p>进入面试准备后，系统会结合这个岗位的 JD、简历版本和经历资产生成材料。</p>
      </section>
      <aside className="prep-panel product-demo-job-resume">
        <span className="prep-kicker">简历版本</span>
        <b>1 版</b>
        <strong>B端产品经理 · JD 定制版</strong>
        <small>已关联当前岗位</small>
      </aside>
    </div>
  )
}

function InterviewScene({ step, activeTab, onTab }) {
  const loading = step === 13
  const content = activeTab === 'knowledge' ? knowledgeSystem : interviewManual

  return (
    <div className="product-demo-interview-real">
      <aside>
        <div>
          <span className="prep-kicker">面试准备</span>
          <h3>目标公司 · B端产品经理</h3>
          <p>已绑定 JD · 已加载 6 条经历资产</p>
        </div>
        <div className="product-demo-interview-context">
          <span>当前岗位 JD</span>
          <p>负责企业协作产品方案设计，理解多角色业务流程，推动复杂工作流落地。</p>
        </div>
        <div className="product-demo-interview-actions">
          <span>材料操作</span>
          <button type="button" className="prep-primary">生成知识体系</button>
          <button type="button" className="prep-secondary">补充知识模块</button>
        </div>
        {loading && (
          <div className="product-demo-interview-loading">
            <i /><i /><i />
            <strong>正在拆解 JD 与经历匹配关系</strong>
          </div>
        )}
      </aside>
      <main className="prep-panel">
        <OutputPanel
          content={loading ? '' : content}
          emptyText="正在生成面试材料…"
          actions={(
            <div className="product-demo-interview-tabs">
              <button
                type="button"
                className={`prep-ghost ${activeTab === 'manual' ? 'bg-[#171321] text-white' : ''}`}
                onClick={() => onTab('manual')}
              >
                面试手册
              </button>
              <button
                type="button"
                className={`prep-ghost ${activeTab === 'knowledge' ? 'bg-[#171321] text-white' : ''}`}
                onClick={() => onTab('knowledge')}
              >
                知识体系
              </button>
            </div>
          )}
          variant={activeTab === 'knowledge' ? 'knowledge' : 'default'}
        />
      </main>
    </div>
  )
}

export default function HomeProductDemo() {
  const navigate = useNavigate()
  const sectionRef = useRef(null)
  const [tourPortal, setTourPortal] = useState(null)
  const [step, setStep] = useState(0)
  const [guideOpen, setGuideOpen] = useState(true)
  const [activeInterviewTab, setActiveInterviewTab] = useState('manual')

  useEffect(() => {
    if (!guideOpen) return undefined
    const selector = tourTargets[step]?.spotlightTarget || tourTargets[step]?.target
    const target = selector ? sectionRef.current?.querySelector(selector) : null
    target?.classList.add('is-guide-active')
    return () => target?.classList.remove('is-guide-active')
  }, [guideOpen, step])

  const scene = sceneForStep(step)
  const replay = () => {
    setGuideOpen(true)
    setActiveInterviewTab('manual')
    setStep(0)
  }
  const jumpTo = nextStep => {
    setGuideOpen(true)
    setActiveInterviewTab(nextStep >= 15 ? 'knowledge' : 'manual')
    setStep(nextStep)
  }
  const goBack = () => jumpTo(Math.max(0, step - 1))
  const goNext = () => {
    if (step >= tourTargets.length - 1) {
      setGuideOpen(false)
      navigate('/library')
      return
    }
    jumpTo(step + 1)
  }
  const progress = Math.min(100, (step / (tourTargets.length - 1)) * 100)
  const tourSteps = useMemo(buildTourSteps, [])

  return (
    <section
      ref={sectionRef}
      className="home-demo product-demo product-demo-complete"
      aria-label="完整产品流程演示"
    >
      <div className="product-demo-heading">
        <div>
          <h2>产品使用引导</h2>
          <p>跟着步骤了解经历、简历、岗位与面试材料如何连接</p>
        </div>
        <div className="product-demo-controls">
          {!guideOpen && (
            <button type="button" onClick={() => setGuideOpen(true)}>继续引导</button>
          )}
          <button type="button" onClick={replay}>重新开始</button>
        </div>
      </div>

      <div className="product-demo-stage-tabs">
        {stages.map(stage => (
          <button
            key={stage.id}
            type="button"
            className={scene === stage.id ? 'is-active' : ''}
            onClick={() => jumpTo(stage.step)}
          >
            {stage.label}
          </button>
        ))}
      </div>

      <div className={`product-demo-frame product-demo-full-scene is-${scene}`}>
        <div className="product-demo-scene-content">
          {scene === 'import' && <ImportScene parsed={step >= 1} />}
          {scene === 'research' && (
            <ResearchScene
              step={step - 1}
              onChoice={() => jumpTo(Math.min(step + 1, 7))}
              onReplay={replay}
            />
          )}
          {scene === 'dossier' && <DossierScene />}
          {scene === 'resume' && (
            <ResumeScene generated={step >= 10} onGenerate={() => jumpTo(10)} />
          )}
          {scene === 'job' && (
            <JobScene pressed={step >= 12} onPrepare={() => jumpTo(13)} />
          )}
          {scene === 'interview' && (
            <InterviewScene
              step={step}
              activeTab={activeInterviewTab}
              onTab={tab => {
                setManual(true)
                setActiveInterviewTab(tab)
              }}
            />
          )}
        </div>

        <div className="product-demo-tour-portal" ref={setTourPortal} />
        {tourPortal && guideOpen && (
          <Joyride
            key={`product-tour-${step}`}
            run
            continuous
            stepIndex={step}
            steps={tourSteps}
            portalElement={tourPortal}
            options={{
              buttons: [],
              disableFocusTrap: true,
              dismissKeyAction: false,
              hideOverlay: true,
              skipScroll: true,
              showProgress: false,
              targetWaitTimeout: 1400,
              width: 390,
              zIndex: 30,
            }}
            arrowComponent={() => null}
            tooltipComponent={props => (
              <DemoGuideTooltip
                {...props}
                onBack={goBack}
                onClose={() => setGuideOpen(false)}
                onNext={goNext}
              />
            )}
          />
        )}
      </div>

      <div className="product-demo-timeline" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  )
}
