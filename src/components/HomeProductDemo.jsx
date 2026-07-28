import React, { useEffect, useMemo, useState } from 'react'
import AgentWorkspacePanel from './AgentWorkspacePanel'
import OutputPanel from './OutputPanel'
import {
  ExperienceDossierProgress,
  ExperienceResearchWorkspace,
} from './experience/ExperienceWorkspaceUI'

const timeline = [1100, 1500, 900, 4200, 1100, 2600, 900, 4800]

const sourceMessage = {
  role: 'user',
  content: '负责卖家自助入驻流程优化，完成申请记录页和详情页设计。',
}

const questionMessage = {
  role: 'assistant',
  content: `## 本轮问题

当时推动入驻流程优化，最主要的问题是什么？

**为什么问：** 先确认真实业务问题，后面才能判断你的产品决策和贡献。

选项：

A. 审核状态不透明，卖家频繁咨询，运营依赖线下同步

B. 不同市场的入驻流程不统一，产品维护成本较高

C. 申请信息分散在多张表格中，审核容易遗漏

D. 其他，我自己补充`,
}

const followupMessage = {
  role: 'assistant',
  content: `## 本轮问题

你当时具体负责了哪些关键判断和产品动作？

**为什么问：** 区分团队成果与你个人真正主导的部分。

选项（可多选）：

A. 梳理卖家注册到开店的全链路和关键状态

B. 设计申请记录页、详情页和状态流转规则

C. 协调运营统一不同市场的审核口径

D. 其他，我自己补充`,
}

const dossierContent = `## 经历档案底稿

### 业务背景与问题

跨境卖家提交入驻申请后无法判断审核进度，频繁向运营咨询；运营侧依赖线下表格同步状态，信息更新不及时，不同市场的处理口径也不统一。

### 个人判断与行动

将问题拆为卖家端状态感知和运营端审核协同两部分，梳理注册至开店全链路，统一关键状态与流转条件，并独立设计申请记录页、详情页及异常状态提示。

## 简历版

- 梳理韩国卖家注册至开店全链路，统一关键审核状态和流转条件，独立设计申请记录页、详情页及异常提示，推动入驻流程标准化与关键节点可视化。

## 完整经历故事

项目开始时，卖家提交材料后无法判断进度，只能反复咨询运营；运营又依赖线下表格同步，导致信息更新慢且容易遗漏。我先把注册、资料提交、审核、补件和开店拆成完整状态链路，再分别确认卖家端需要看到的信息与运营端需要处理的动作，最终形成记录页、详情页和状态流转方案。

## 面试工具包

### 30 秒开场

这段经历里，我解决的是跨境卖家入驻状态不透明的问题。我梳理了注册到开店的完整流程，统一关键状态和流转条件，并独立完成申请记录页与详情页设计，让卖家能看到进度，也让运营的审核协同更标准化。`

function DemoProgress({ answered }) {
  return (
    <ExperienceDossierProgress
      progress={answered ? 46 : 28}
      fields={[
        {
          label: '基础信息',
          value: '跨境卖家自助入驻流程 · 产品实习生',
          confirmed: true,
        },
        {
          label: '业务问题',
          value: answered ? '审核状态不透明，卖家频繁咨询，运营依赖线下同步。' : '待确认',
          confirmed: answered,
          highlight: answered,
        },
        { label: '个人判断与行动', value: answered ? '正在继续确认' : '待确认' },
        { label: '结果证据', value: '待补充' },
      ]}
      note={answered ? '已记录到经历档案' : ''}
    />
  )
}

export default function HomeProductDemo() {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [manual, setManual] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (manual || paused || reducedMotion || step >= timeline.length) return undefined
    const timer = window.setTimeout(() => setStep(current => current + 1), timeline[step])
    return () => window.clearTimeout(timer)
  }, [manual, paused, reducedMotion, step])

  const hasQuestion = step >= 2
  const isThinking = step === 1
  const answered = step >= 4
  const hasDossier = step >= 7
  const messages = useMemo(() => {
    const next = [sourceMessage]
    if (hasQuestion) next.push(questionMessage)
    if (answered) {
      next.push({
        role: 'user',
        content: 'A. 审核状态不透明，卖家频繁咨询，运营依赖线下同步',
      })
      next.push(followupMessage)
    }
    return next
  }, [answered, hasQuestion])

  const replay = () => {
    setManual(false)
    setPaused(false)
    setStep(0)
  }

  const selectChoice = option => {
    if (option.label !== 'A') return
    setManual(true)
    setStep(4)
  }

  const progress = Math.min(100, (step / timeline.length) * 100)

  return (
    <section
      className="home-demo product-demo"
      aria-label="经历调研功能演示"
      onMouseEnter={() => !manual && setPaused(true)}
      onMouseLeave={() => !manual && setPaused(false)}
    >
      <div className="product-demo-heading">
        <h2>经历调研</h2>
        <div className="product-demo-controls">
          {!manual && step < timeline.length && (
            <button type="button" onClick={() => setPaused(current => !current)}>
              {paused ? '继续' : '暂停'}
            </button>
          )}
          <button type="button" onClick={replay}>重新播放</button>
        </div>
      </div>

      <div className="product-demo-frame product-demo-real-page">
        <div className="product-demo-real-canvas">
          <ExperienceResearchWorkspace
            hasDossier={hasDossier}
            action={<button type="button" className="prep-ghost" onClick={replay}>新调研</button>}
            chat={(
              <AgentWorkspacePanel
                context={{}}
                placeholder="描述经历，或回答助手的问题…"
                emptyTitle="描述一段经历，助手会继续追问"
                emptyText="它会把这段经历问透，确认生成模式后，再产出经历档案底稿、简历版、完整故事和面试工具包。"
                demoState={{
                  messages,
                  loading: isThinking,
                  streamingText: '',
                  toolEvents: [],
                  pendingApproval: null,
                  onChoiceSelect: selectChoice,
                  onSubmit: () => {},
                  onClear: replay,
                }}
              />
            )}
            dossier={!hasDossier ? (
              <div className="experience-guide-shared">
                <DemoProgress answered={answered} />
                <div className="experience-guide-next">
                  <strong>{answered ? '继续回答左侧问题' : '根据选项确认真实情况'}</strong>
                  <p>确认的信息会同步整理到经历档案中。</p>
                  <button type="button" className="prep-ghost">查看经历资产</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/70 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-black text-[#171321]">经历档案</h2>
                    <p className="mt-0.5 text-xs font-semibold text-[#8a8296]">
                      档案底稿 · 简历版 · 完整故事 · 面试工具包
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="prep-chip prep-chip-warn">草稿未保存</span>
                    <button type="button" className="prep-primary">保存为经历资产</button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  <div className="prep-panel h-full overflow-hidden">
                    <OutputPanel content={dossierContent} variant="experience" />
                  </div>
                </div>
              </>
            )}
          />
        </div>
      </div>

      <div className="product-demo-timeline" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  )
}
