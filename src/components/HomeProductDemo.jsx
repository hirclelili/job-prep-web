import React, { useEffect, useMemo, useState } from 'react'

const timeline = [
  1300, // asset row
  900,  // click deep dive
  1200, // enter research
  4300, // read question
  900,  // select answer
  2900, // dossier updates
  900,  // generate dossier
  3800, // inspect dossier
  900,  // use in resume
]

const resumeVersions = {
  product: {
    label: '产品方向',
    bullet: '针对跨境卖家入驻状态不透明、运营依赖线下表格的问题，梳理注册至开店全链路并设计申请记录页、详情页及状态流转方案，推动流程标准化与关键节点可视化。',
  },
  solution: {
    label: 'B 端解决方案',
    bullet: '面向跨境卖家与运营审核团队梳理入驻协同流程，统一各市场关键节点和状态口径，交付申请记录、详情追踪与异常处理方案，降低多角色信息同步成本。',
  },
}

function DemoCursor({ step, visible }) {
  if (!visible) return null
  const clicking = [1, 4, 6, 8].includes(step)
  return (
    <div className={`product-demo-cursor product-demo-cursor-${step} ${clicking ? 'is-clicking' : ''}`} aria-hidden="true">
      <span />
    </div>
  )
}

function DemoAssetLibrary({ step, onStart }) {
  return (
    <div className="product-demo-screen product-demo-library">
      <div className="product-demo-page-head">
        <div>
          <span>我的经历</span>
          <strong>经历资产</strong>
          <p>导入的经历是原始材料，深度整理后才能用于简历和面试。</p>
        </div>
        <div className="product-demo-stats">
          <span>6 条经历</span>
          <span>5 条待调研</span>
        </div>
      </div>
      <div className="product-demo-library-alert">
        <strong>还有 5 段经历需要补充</strong>
        <span>AI 会沿着现有内容继续追问，不会直接改写成成品。</span>
      </div>
      <div className="product-demo-exp-row">
        <div className="product-demo-exp-status">待调研</div>
        <div className="product-demo-exp-copy">
          <strong>某跨境电商 · Seller 产品实习生</strong>
          <span>2023.10 – 2024.03</span>
          <p>负责卖家自助入驻流程优化，完成申请记录页和详情页设计。</p>
        </div>
        <button type="button" className={step === 1 ? 'is-pressed' : ''} onClick={onStart}>
          深度整理
        </button>
      </div>
    </div>
  )
}

function DemoDossierStatus({ answered }) {
  const progress = answered ? 46 : 28
  return (
    <div className="product-demo-dossier-status">
      <div className="product-demo-dossier-title">
        <div>
          <strong>经历档案</strong>
          <span>确认的信息会实时沉淀到这里</span>
        </div>
        <b>{progress}%</b>
      </div>
      <div className="product-demo-meter"><span style={{ width: `${progress}%` }} /></div>
      <div className="product-demo-dossier-lines">
        <div className="is-confirmed">
          <span>基础信息</span>
          <p>跨境卖家自助入驻流程 · 产品实习生</p>
        </div>
        <div className={answered ? 'is-confirmed is-new' : ''}>
          <span>业务问题</span>
          <p>{answered ? '审核状态不透明，卖家频繁咨询，运营依赖线下同步。' : '待补充'}</p>
        </div>
        <div>
          <span>个人判断</span>
          <p>待补充</p>
        </div>
        <div>
          <span>结果证据</span>
          <p>待补充</p>
        </div>
      </div>
      {answered && <div className="product-demo-saved-note">已记录到业务背景</div>}
    </div>
  )
}

function DemoResearch({ step, onSelect, onGenerate }) {
  const answered = step >= 5
  const isLoading = step === 2
  return (
    <div className="product-demo-screen product-demo-research-screen">
      <div className="product-demo-research-head">
        <div>
          <span>我的经历</span>
          <strong>经历调研</strong>
          <p>AI 给选项，你确认和补充，最后沉淀经历档案</p>
        </div>
        <span className="product-demo-sample-tag">示例数据</span>
      </div>
      <div className="product-demo-research-body">
        <div className="product-demo-chat">
          <div className="product-demo-user-message">
            <span>你</span>
            <p>负责卖家自助入驻流程优化，完成申请记录页和详情页设计。</p>
          </div>
          {isLoading ? (
            <div className="product-demo-thinking">
              <span>AI 正在读取经历并判断缺失信息</span>
              <i /><i /><i />
            </div>
          ) : (
            <div className="product-demo-ai-message">
              <span>AI</span>
              <p className="product-demo-question-copy">
                当时推动入驻流程优化，最主要的问题是什么？
              </p>
              <small>选择一个继续，也可以补充真实情况</small>
              <div className="product-demo-options">
                {[
                  ['A', '审核状态不透明，卖家频繁咨询，运营依赖线下同步'],
                  ['B', '不同市场的入驻流程不统一，产品维护成本较高'],
                  ['C', '申请信息分散在多张表格中，审核容易遗漏'],
                  ['D', '其他，我自己补充'],
                ].map(([label, text]) => (
                  <button
                    key={label}
                    type="button"
                    className={answered && label === 'A' ? 'is-selected' : ''}
                    onClick={() => label === 'A' && onSelect()}
                  >
                    <b>{answered && label === 'A' ? '✓' : label}</b>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
              {answered && (
                <button
                  type="button"
                  className={`product-demo-generate ${step === 6 ? 'is-pressed' : ''}`}
                  onClick={onGenerate}
                >
                  生成经历档案
                </button>
              )}
            </div>
          )}
        </div>
        <DemoDossierStatus answered={answered} />
      </div>
    </div>
  )
}

function DemoDossier({ step, onResume }) {
  return (
    <div className="product-demo-screen product-demo-dossier-screen">
      <div className="product-demo-dossier-head">
        <div>
          <span>经历调研</span>
          <strong>经历档案</strong>
          <p>同一份确认事实，可以继续用于简历和面试。</p>
        </div>
        <div>
          <span>完整度 82%</span>
          <button type="button" className={step === 8 ? 'is-pressed' : ''} onClick={onResume}>
            用于简历
          </button>
        </div>
      </div>
      <div className="product-demo-dossier-content">
        <aside>
          <span className="is-active">档案底稿</span>
          <span>简历版</span>
          <span>完整故事</span>
          <span>面试工具包</span>
        </aside>
        <div className="product-demo-dossier-document">
          <section>
            <span>业务背景与问题</span>
            <p>跨境卖家提交入驻申请后无法判断审核进度，频繁向运营咨询；运营侧依赖线下表格同步状态，信息更新不及时。</p>
          </section>
          <section>
            <span>个人判断与行动</span>
            <p>将问题拆为卖家端状态感知和运营端审核协同两部分，梳理注册至开店全链路，统一关键状态和流转条件。</p>
          </section>
          <section>
            <span>可复用简历表达</span>
            <p>梳理卖家注册至开店全链路，设计申请记录页、详情页及状态流转方案，推动入驻流程标准化与关键节点可视化。</p>
          </section>
          <section className="is-pending">
            <span>仍待补充</span>
            <p>上线后的咨询量变化、审核周期和覆盖市场数量。</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function DemoResume({ version, onVersionChange }) {
  const current = resumeVersions[version]
  return (
    <div className="product-demo-screen product-demo-resume-screen">
      <div className="product-demo-resume-config">
        <span>简历版本</span>
        <strong>选择表达方向</strong>
        <p>经历事实保持不变，只调整重点和语言。</p>
        <div className="product-demo-version-switch" role="tablist" aria-label="示例简历方向">
          {Object.entries(resumeVersions).map(([key, item]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={version === key}
              className={version === key ? 'is-active' : ''}
              onClick={() => onVersionChange(key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="product-demo-strategy">
          <span>本次强调</span>
          <strong>{version === 'product' ? '流程拆解 · 产品方案 · 推动落地' : '客户痛点 · 多角色协同 · 方案交付'}</strong>
        </div>
      </div>
      <div className="product-demo-resume-paper">
        <header>
          <div>
            <strong>李小序</strong>
            <span>138 0000 0000 · hello@example.com</span>
          </div>
          <b>{current.label}简历</b>
        </header>
        <section>
          <h3>实习经历</h3>
          <div className="product-demo-resume-entry">
            <strong>某跨境电商｜Seller 产品实习生｜2023.10 – 2024.03</strong>
            <p key={version}>{current.bullet}</p>
          </div>
        </section>
        <div className="product-demo-resume-proof">
          来自经历档案中的已确认事实
        </div>
      </div>
    </div>
  )
}

export default function HomeProductDemo() {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [manual, setManual] = useState(false)
  const [version, setVersion] = useState('product')
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

  const scene = useMemo(() => {
    if (step < 2) return 'library'
    if (step < 7) return 'research'
    if (step < 9) return 'dossier'
    return 'resume'
  }, [step])

  const takeControl = nextStep => {
    setManual(true)
    setStep(nextStep)
  }

  const replay = () => {
    setVersion('product')
    setManual(false)
    setPaused(false)
    setStep(0)
  }

  const progress = Math.min(100, (step / timeline.length) * 100)
  const cursorVisible = !manual && !reducedMotion && step < timeline.length

  return (
    <section
      className="home-demo product-demo"
      aria-label="真实产品交互演示"
      onMouseEnter={() => !manual && setPaused(true)}
      onMouseLeave={() => !manual && setPaused(false)}
    >
      <div className="product-demo-heading">
        <div>
          <span>真实交互演示</span>
          <h2>看一段普通经历，怎样被问清楚并用于简历</h2>
          <p>演示使用固定示例数据，不调用 API，也不会写入你的经历库。</p>
        </div>
        <div className="product-demo-controls">
          <span>{manual ? '自由体验' : step >= timeline.length ? '演示完成' : paused ? '已暂停' : '自动演示中'}</span>
          {!manual && step < timeline.length && (
            <button type="button" onClick={() => setPaused(current => !current)}>
              {paused ? '继续' : '暂停'}
            </button>
          )}
          <button type="button" onClick={replay}>重新播放</button>
        </div>
      </div>

      <div className="product-demo-frame">
        <div className="product-demo-frame-bar">
          <span className="product-demo-brand">职序</span>
          <div>
            <span className={scene === 'library' ? 'is-active' : ''}>经历资产</span>
            <span className={scene === 'research' || scene === 'dossier' ? 'is-active' : ''}>经历调研</span>
            <span className={scene === 'resume' ? 'is-active' : ''}>简历版本</span>
          </div>
          <span className="product-demo-example">DEMO</span>
        </div>

        <div className={`product-demo-scene product-demo-scene-${scene}`} key={scene}>
          {scene === 'library' && <DemoAssetLibrary step={step} onStart={() => takeControl(3)} />}
          {scene === 'research' && (
            <DemoResearch
              step={step}
              onSelect={() => takeControl(5)}
              onGenerate={() => takeControl(7)}
            />
          )}
          {scene === 'dossier' && <DemoDossier step={step} onResume={() => takeControl(9)} />}
          {scene === 'resume' && <DemoResume version={version} onVersionChange={key => {
            setManual(true)
            setVersion(key)
          }} />}
        </div>
        <DemoCursor step={step} visible={cursorVisible} />
      </div>

      <div className="product-demo-timeline" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  )
}
