import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'

const tabs = [
  { to: '/experience', label: '整理经历', icon: '✍️' },
  { to: '/battle-plan', label: '备战面试', icon: '🎯' },
  { to: '/library', label: '经历库', icon: '📁' },
  { to: '/jobs', label: '岗位库', icon: '💼' },
]

export default function NavBar() {
  const { isConfigured, settings, setShowSettings } = useApp()

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-4 sticky top-0 z-40">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mr-4 rounded-lg px-1.5 py-1 hover:bg-gray-50 transition-colors">
        <span className="text-lg">🚀</span>
        <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">求职备战助手</span>
      </Link>

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
          isConfigured
            ? 'text-gray-500 hover:bg-gray-50'
            : 'bg-orange-50 text-orange-600 font-medium hover:bg-orange-100'
        }`}
      >
        <span>⚙️</span>
        <span>
          {isConfigured
            ? `${settings.provider?.toUpperCase()} · ${settings.model}`
            : '设置 API Key'}
        </span>
        {!isConfigured && <span className="w-2 h-2 rounded-full bg-orange-400" />}
      </button>
    </header>
  )
}
