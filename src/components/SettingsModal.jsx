import React, { useMemo, useState } from 'react'
import {
  PROVIDERS,
  fetchAvailableModels,
  getProviderConfig,
  testLLMConnection,
} from '../services/llm'
import { useApp } from '../contexts/AppContext'

function initialForm(settings) {
  const providerKey = settings.provider === 'custom' || PROVIDERS[settings.provider]
    ? settings.provider
    : 'deepseek'
  const config = getProviderConfig({ ...settings, provider: providerKey })
  const legacyModel = providerKey === 'deepseek' && settings.model === 'deepseek-chat'
    ? 'deepseek-v4-flash'
    : settings.model
  return {
    provider: providerKey,
    providerName: settings.providerName || '',
    baseURL: settings.baseURL || config.baseURL || '',
    format: settings.format || config.format || 'openai',
    apiKey: settings.apiKey || '',
    model: legacyModel || config.models?.[0]?.id || '',
  }
}

export default function SettingsModal() {
  const { settings, updateSettings, setShowSettings } = useApp()
  const [form, setForm] = useState(() => initialForm(settings))
  const [mode, setMode] = useState(settings.provider === 'custom' ? 'custom' : 'preset')
  const [remoteModels, setRemoteModels] = useState([])
  const [manualModel, setManualModel] = useState(() => {
    const initial = initialForm(settings)
    const config = getProviderConfig(initial)
    return !config.models?.some(item => item.id === initial.model)
  })
  const [modelState, setModelState] = useState({ type: 'idle', message: '' })
  const [testState, setTestState] = useState({ type: 'idle', message: '' })

  const provider = getProviderConfig(form)
  const modelOptions = useMemo(() => {
    const merged = [...(provider.models || []), ...remoteModels]
    const seen = new Set()
    return merged.filter(item => {
      if (!item.id || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [provider.models, remoteModels])

  const setField = (key, value) => {
    setForm(current => ({ ...current, [key]: value }))
    setTestState({ type: 'idle', message: '' })
  }

  const selectPreset = (providerKey) => {
    const next = PROVIDERS[providerKey]
    const savedModel = providerKey === settings.provider ? settings.model || '' : ''
    setMode('preset')
    setRemoteModels([])
    setManualModel(next.models.length === 0 || Boolean(savedModel && !next.models.some(item => item.id === savedModel)))
    setModelState({ type: 'idle', message: '' })
    setTestState({ type: 'idle', message: '' })
    setForm({
      provider: providerKey,
      providerName: '',
      baseURL: next.baseURL,
      format: next.format,
      apiKey: providerKey === settings.provider ? settings.apiKey || '' : '',
      model: savedModel || next.models[0]?.id || '',
    })
  }

  const selectCustom = () => {
    setMode('custom')
    setRemoteModels([])
    setManualModel(true)
    setModelState({ type: 'idle', message: '' })
    setTestState({ type: 'idle', message: '' })
    setForm(() => ({
      provider: 'custom',
      providerName: settings.provider === 'custom' ? settings.providerName || '' : '',
      baseURL: settings.provider === 'custom' ? settings.baseURL || '' : '',
      format: settings.provider === 'custom' ? settings.format || 'openai' : 'openai',
      apiKey: settings.provider === 'custom' ? settings.apiKey || '' : '',
      model: settings.provider === 'custom' ? settings.model || '' : '',
    }))
  }

  const handleFetchModels = async () => {
    setModelState({ type: 'loading', message: '正在读取可用模型…' })
    try {
      const models = await fetchAvailableModels(form)
      setRemoteModels(models)
      setManualModel(false)
      setForm(current => ({
        ...current,
        model: models.some(item => item.id === current.model) ? current.model : models[0].id,
      }))
      setModelState({ type: 'success', message: `已读取 ${models.length} 个可用模型` })
    } catch (error) {
      setModelState({ type: 'error', message: error.message })
    }
  }

  const handleTest = async () => {
    setTestState({ type: 'loading', message: '正在测试连接…' })
    try {
      await testLLMConnection(form)
      setTestState({ type: 'success', message: '连接成功，可以正常调用当前模型' })
    } catch (error) {
      setTestState({ type: 'error', message: error.message })
    }
  }

  const handleSave = () => {
    if (!form.apiKey.trim() || !form.model.trim() || !provider.baseURL) return
    updateSettings({
      ...form,
      providerName: form.provider === 'custom' ? form.providerName.trim() || '自定义接口' : '',
      baseURL: provider.baseURL,
      format: provider.format,
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
    })
    setShowSettings(false)
  }

  const canConnect = Boolean(form.apiKey.trim() && form.model.trim() && provider.baseURL)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 py-8 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">API 设置</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            API Key 仅保存在当前浏览器。模型请求会直接发送给你选择的服务商。
          </p>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-5 inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => selectPreset(form.provider === 'custom' ? 'deepseek' : form.provider)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                mode === 'preset' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'
              }`}
            >
              常用供应商
            </button>
            <button
              onClick={selectCustom}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                mode === 'custom' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'
              }`}
            >
              自定义接口
            </button>
          </div>

          <div className="space-y-5">
            {mode === 'preset' ? (
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">AI 供应商</label>
                <select
                  value={form.provider}
                  onChange={event => selectPreset(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  {Object.entries(PROVIDERS).map(([key, item]) => (
                    <option key={key} value={key}>{item.name}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-400">{provider.hint}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-600">接口名称</label>
                  <input
                    value={form.providerName}
                    onChange={event => setField('providerName', event.target.value)}
                    placeholder="例如：公司模型网关"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-600">接口协议</label>
                  <select
                    value={form.format}
                    onChange={event => setField('format', event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="openai">OpenAI Compatible</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="mb-2 block text-xs font-medium text-gray-600">API 地址</label>
                  <input
                    value={form.baseURL}
                    onChange={event => setField('baseURL', event.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={event => setField('apiKey', event.target.value)}
                placeholder={provider.placeholder}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-gray-600">模型</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManualModel(current => !current)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900"
                  >
                    {manualModel ? '从列表选择' : '手动填写'}
                  </button>
                  <button
                    onClick={handleFetchModels}
                    disabled={!form.apiKey.trim() || !provider.baseURL || modelState.type === 'loading'}
                    className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {modelState.type === 'loading' ? '读取中' : '获取模型列表'}
                  </button>
                </div>
              </div>

              {manualModel || modelOptions.length === 0 ? (
                <input
                  value={form.model}
                  onChange={event => setField('model', event.target.value)}
                  placeholder={form.provider === 'doubao' ? '填写推理接入点 ID' : '输入模型 ID'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              ) : (
                <select
                  value={modelOptions.some(item => item.id === form.model) ? form.model : ''}
                  onChange={event => setField('model', event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="" disabled>选择模型</option>
                  {modelOptions.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              )}

              {modelState.message && (
                <p className={`mt-2 text-xs ${
                  modelState.type === 'error' ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {modelState.message}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <strong className="block text-sm font-medium text-gray-900">连接检查</strong>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    验证 API Key、接口地址和当前模型是否可用。
                  </span>
                </div>
                <button
                  onClick={handleTest}
                  disabled={!canConnect || testState.type === 'loading'}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {testState.type === 'loading' ? '测试中' : '测试连接'}
                </button>
              </div>
              {testState.message && (
                <p className={`mt-3 border-t border-gray-200 pt-3 text-xs leading-5 ${
                  testState.type === 'error' ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {testState.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={() => setShowSettings(false)}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canConnect}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}
