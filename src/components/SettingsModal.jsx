import React, { useState } from 'react'
import { PROVIDERS } from '../services/llm'
import { useApp } from '../contexts/AppContext'

export default function SettingsModal() {
  const { settings, updateSettings, setShowSettings } = useApp()
  const [form, setForm] = useState({
    provider: settings.provider || 'deepseek',
    apiKey: settings.apiKey || '',
    model: settings.model || '',
  })

  const provider = PROVIDERS[form.provider]

  const handleProviderChange = (p) => {
    setForm(f => ({ ...f, provider: p, model: PROVIDERS[p].models[0].id, apiKey: '' }))
  }

  const handleSave = () => {
    if (!form.apiKey.trim()) return
    const model = form.model || provider.models[0].id
    updateSettings({ ...form, model })
    setShowSettings(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">API 设置</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            API Key 保存在当前浏览器本地；调用 AI 时，请求内容会发送给你选择的模型服务商。
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Provider selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">选择 AI 供应商</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key)}
                  className={`px-3 py-2 rounded-lg text-sm text-left transition-all border ${
                    form.provider === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">模型</label>
            <select
              value={form.model || provider.models[0].id}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {provider.models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              API Key
              <span className="ml-2 font-normal text-gray-400">{provider.hint}</span>
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder={provider.placeholder}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!form.apiKey.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
