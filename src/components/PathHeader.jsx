import React from 'react'
import { useNavigate } from 'react-router-dom'
import { journeySteps } from '../constants/journey'

export default function PathHeader({ current, title, subtitle, compact = false, actions = null, hideNavigation = false }) {
  const navigate = useNavigate()
  const currentIndex = Math.max(0, journeySteps.findIndex(step => step.id === current))
  const prev = journeySteps[currentIndex - 1]
  const next = journeySteps[currentIndex + 1]
  const currentStep = journeySteps[currentIndex]

  return (
    <section className={compact ? 'mb-4' : 'mb-6'}>
      <div className="dopamine-panel dopamine-outline relative flex min-h-[148px] items-center overflow-hidden rounded-[26px] px-5 py-5 md:px-6">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[#ec4899]" />
        <div className="relative flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title || currentStep?.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle || currentStep?.desc}</p>
        </div>
        {actions || (!hideNavigation && (
          <div className="flex gap-2">
            {prev && (
              <button
                onClick={() => navigate(prev.path)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50"
              >
                上一步
              </button>
            )}
            {next && next.path !== currentStep?.path && (
              <button
                onClick={() => navigate(next.path)}
                className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                下一步：{next.title}
              </button>
            )}
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}
