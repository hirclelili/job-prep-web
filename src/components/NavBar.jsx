import React from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { getProviderConfig } from '../services/llm'

const navItems = [
  {
    label: '我的经历',
    to: '/library',
    match: pathname => ['/import', '/experience', '/library'].includes(pathname),
  },
  {
    label: '投递准备',
    to: '/directions',
    match: pathname => pathname === '/directions' || pathname === '/resumes',
  },
  {
    label: '岗位',
    to: '/jobs',
    match: pathname => pathname === '/jobs' || (pathname.startsWith('/jobs/') && !pathname.endsWith('/prepare')),
  },
  {
    label: '面试准备',
    to: '/interviews',
    match: pathname => pathname === '/interviews' || pathname === '/battle-plan' || pathname.endsWith('/prepare'),
  },
]

export default function NavBar() {
  const location = useLocation()
  const { isConfigured, settings, setShowSettings } = useApp()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-4 px-6">
        <Link to="/" className="group flex shrink-0 items-center gap-3 rounded-2xl pr-2 text-base font-semibold tracking-tight text-violet-950">
          <span className="relative h-9 w-9 rounded-xl bg-[#161226]">
            <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ec4899]" />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#0891b2]" />
            <span className="absolute bottom-2 left-3.5 h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          </span>
          <span className="leading-tight">
            <span className="block">职序</span>
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {navItems.map(item => {
            const active = item.match(location.pathname)
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <button
          onClick={() => setShowSettings(true)}
          className={`flex max-w-[260px] items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
            isConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
              : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
          }`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-orange-400'}`} />
          <span className="truncate">
            {isConfigured
              ? `${getProviderConfig(settings).name} · ${settings.model}`
              : '设置 API Key'}
          </span>
        </button>
      </div>
    </header>
  )
}
