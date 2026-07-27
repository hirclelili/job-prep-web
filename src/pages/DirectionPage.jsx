import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PathHeader from '../components/PathHeader'
import { parseJsonFromMarkdown, runTextSkill } from '../skills/core'
import { resumeDirectionRecommendationSkill } from '../skills/resumeSkills'
import { subscribeAgentArtifacts } from '../agent/events'
import { useApp } from '../contexts/AppContext'
import { clearDraft, DRAFT_KEYS, readDraft, writeDraft } from '../utils/draftStorage'
import { getResumes } from '../utils/storage'

const DIRECTION_RECOMMENDATION_VERSION = 2

function buildExperienceScope(experiences) {
  return experiences
    .map(exp => `${exp.id || ''}:${exp.savedAt || exp.updatedAt || ''}`)
    .sort()
    .join('|')
}

function hasResumeDraftContent(draft) {
  const data = draft?.data || {}
  return Boolean(
    data.outputText?.trim()
    || data.resumeStrategy
    || data.confirmedStrategy
    || data.jdText?.trim()
    || data.titleInput?.trim()
  )
}

export default function DirectionPage() {
  const navigate = useNavigate()
  const { experiences, settings, isConfigured, setShowSettings } = useApp()
  const directionScope = buildExperienceScope(experiences)
  const [initialDraft] = useState(() => {
    const draft = readDraft(DRAFT_KEYS.direction)
    return draft?.data?.scope === directionScope
      && draft?.data?.recommendationVersion === DIRECTION_RECOMMENDATION_VERSION
      ? draft
      : null
  })
  const [customDirection, setCustomDirection] = useState(() => initialDraft?.data?.customDirection || '')
  const [recommendations, setRecommendations] = useState(() => initialDraft?.data?.recommendations || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(() => initialDraft?.updatedAt || '')
  const [restoredDraft, setRestoredDraft] = useState(() => Boolean(initialDraft))
  const [savedResumeCount] = useState(() => getResumes().length)
  const [hasResumeDraft] = useState(() => hasResumeDraftContent(readDraft(DRAFT_KEYS.resume)))
  const directionScopeRef = useRef(directionScope)
  const restoringDraftRef = useRef(false)

  const importedCount = experiences.filter(exp => exp.status === 'imported').length
  const optimizedCount = experiences.length - importedCount

  useEffect(() => subscribeAgentArtifacts(artifact => {
    if (artifact?.type !== 'resume.directions') return
    const parsed = parseJsonFromMarkdown(artifact.content || '')
    if (parsed?.directions) {
      setRecommendations(parsed.directions)
      setCustomDirection('')
    }
    setError('')
    setLoading(false)
  }), [])

  useEffect(() => {
    if (directionScopeRef.current === directionScope) return
    restoringDraftRef.current = true
    directionScopeRef.current = directionScope
    const draft = readDraft(DRAFT_KEYS.direction)
    const matchingDraft = draft?.data?.scope === directionScope
      && draft?.data?.recommendationVersion === DIRECTION_RECOMMENDATION_VERSION
      ? draft
      : null
    setCustomDirection(matchingDraft?.data?.customDirection || '')
    setRecommendations(matchingDraft?.data?.recommendations || [])
    setDraftUpdatedAt(matchingDraft?.updatedAt || '')
    setRestoredDraft(Boolean(matchingDraft))
    setError('')
    setLoading(false)
  }, [directionScope])

  useEffect(() => {
    if (restoringDraftRef.current) {
      restoringDraftRef.current = false
      return
    }
    if (!customDirection.trim() && !recommendations.length) {
      clearDraft(DRAFT_KEYS.direction)
      setDraftUpdatedAt('')
      return
    }
    const saved = writeDraft(DRAFT_KEYS.direction, {
      scope: directionScope,
      recommendationVersion: DIRECTION_RECOMMENDATION_VERSION,
      customDirection,
      recommendations,
    })
    if (saved) setDraftUpdatedAt(saved.updatedAt)
  }, [customDirection, directionScope, recommendations])

  const handleAnalyze = async () => {
    if (!isConfigured) { setShowSettings(true); return }
    if (!experiences.length || loading) return
    setRestoredDraft(false)
    setError('')
    setLoading(true)
    try {
      const result = await runTextSkill({
        skill: resumeDirectionRecommendationSkill,
        settings,
        input: { experiences },
      })
      setRecommendations(result.directions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openResumeDirection = (target, targetSource = 'custom', strategyMode = 'direction') => {
    if (!target?.trim()) return
    navigate('/resumes', {
      state: {
        target: target.trim(),
        targetSource,
        strategyMode,
        mode: 'editor',
        autoAnalyzeStrategy: false,
      },
    })
  }

  return (
    <div className="prep-bg">
      <main className="prep-shell">
      <PathHeader
        current="direction"
        title="选岗位方向"
        subtitle="先用经历资产判断更适合投什么方向，再去生成对应的简历版本。"
        hideNavigation
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {hasResumeDraft && (
              <button
                onClick={() => navigate('/resumes', { state: { mode: 'editor' } })}
                className="prep-secondary"
              >
                继续草稿
              </button>
            )}
            {savedResumeCount > 0 && (
              <button
                onClick={() => navigate('/resumes', { state: { mode: 'library' } })}
                className="prep-primary"
              >
                简历版本
              </button>
            )}
          </div>
        )}
      />

      {experiences.length === 0 ? (
        <div className="prep-panel mt-6 p-10 text-center">
          <p className="text-base font-black text-[#171321]">还没有经历资产</p>
          <p className="prep-muted mt-2 text-sm">先导入简历或做经历调研，再来判断岗位方向会更准。</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => navigate('/import')}
              className="prep-primary"
            >
              去导入简历
            </button>
            <button
              onClick={() => navigate('/experience')}
              className="prep-secondary"
            >
              去经历调研
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 mt-5 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#171321]/7 bg-white/55 px-4 py-2 text-xs font-bold text-[#8a8296]">
            <span>经历资产 {experiences.length}</span>
            <span className="text-[#c9c2d0]">·</span>
            <span className="text-[#16704a]">已深挖 {optimizedCount}</span>
            <span className="text-[#c9c2d0]">·</span>
            <span className="text-[#9a5a00]">待调研 {importedCount}</span>
            {importedCount > 0 && (
              <>
                <span className="text-[#c9c2d0]">·</span>
                <span className="font-semibold text-[#7a6541]">{importedCount} 段经历尚未深挖，推荐准确度可能受影响</span>
              </>
            )}
            {draftUpdatedAt && (
              <>
                <span className="text-[#c9c2d0]">·</span>
                <span>{restoredDraft ? '已恢复上次选择' : '选择已保存'}</span>
              </>
            )}
          </div>

          <section className="space-y-3">
            <div className="prep-panel-tight flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171321] text-xs font-black text-white">01</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[#171321]">通用版本</h2>
                <p className="prep-muted mt-1 text-sm">不绑定特定岗位方向，保留经历中最完整、最有说服力的内容。</p>
              </div>
              <button
                onClick={() => openResumeDirection('通用实习简历', 'custom', 'baseline')}
                className="prep-secondary shrink-0"
              >
                配置简历
              </button>
            </div>

            <div className="prep-panel-tight flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff04a] text-xs font-black text-[#171321]">02</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[#171321]">自定义岗位方向</h2>
                <input
                  value={customDirection}
                  onChange={event => {
                    setCustomDirection(event.target.value)
                    setRestoredDraft(false)
                  }}
                  className="prep-input mt-2 w-full px-3 py-2 text-sm"
                  placeholder="例如：B端解决方案、销售/BD"
                />
              </div>
              <button
                onClick={() => openResumeDirection(customDirection, 'custom', 'direction')}
                disabled={!customDirection.trim()}
                className="prep-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-35"
              >
                配置简历
              </button>
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between gap-5 rounded-2xl bg-[#171321] px-5 py-4 text-white">
              <div>
                <p className="text-xs font-black text-[#55dff1]">AI 推荐方向</p>
                <p className="mt-1 text-sm font-semibold text-white/70">根据行动、决策和结果证据发现直接方向与可迁移方向。</p>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="min-h-10 shrink-0 rounded-xl bg-[#55dff1] px-5 text-sm font-black text-[#171321] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '正在分析经历…' : recommendations.length ? '重新分析' : 'AI 分析我的经历'}
              </button>
            </div>

            {recommendations.length > 0 ? (
              <div className="mt-3 space-y-3">
                {recommendations.map((direction, index) => (
                  <div key={direction.id || direction.name} className="prep-panel-tight flex items-start gap-4 p-5">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: ['#55dff1', '#ff5cc8', '#b6ffdd', '#fff04a'][index % 4] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-[#171321]">{direction.name}</h2>
                        {index === 0 && <span className="prep-chip prep-chip-soft">最匹配</span>}
                        <span className="prep-chip">
                          {direction.pathType === 'adjacent' ? '相邻方向' : '直接方向'} · {direction.fit}
                        </span>
                      </div>
                      <p className="prep-muted mt-2 text-sm leading-6">{direction.reason}</p>
                      {direction.evidence?.[0]?.proof && (
                        <p className="mt-2 text-xs font-semibold leading-5 text-[#5f566c]">
                          能力依据：{direction.evidence[0].proof}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(direction.coreCompetencies || []).slice(0, 5).map(keyword => (
                          <span key={keyword} className="prep-chip prep-chip-hit">{keyword}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => openResumeDirection(direction.name, 'recommended', 'direction')}
                      className="prep-primary shrink-0"
                    >
                      配置简历
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-[#171321]/15 bg-white/35 px-5 py-6 text-center text-sm font-semibold text-[#8a8296]">
                点击上方按钮，让 AI 从全部经历资产中推荐 3–5 个方向。
              </div>
            )}
          </section>
          {error && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
          )}
        </>
      )}
      </main>
    </div>
  )
}
