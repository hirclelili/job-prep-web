import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs } from '../utils/storage'
import { useApp } from '../contexts/AppContext'

const actions = [
  {
    title: '整理经历',
    desc: '通过 AI 追问，把一段口述经历整理成简历条目、STAR 故事、亮点和追问素材。',
    detail: '适合在投递前先把自己的项目、实习、校园经历打磨清楚。',
    icon: '✍️',
    to: '/experience',
  },
  {
    title: '备战面试',
    desc: '粘贴 JD 后，先做岗位拆解，再生成面试手册和知识体系。',
    detail: '适合针对某个具体岗位做匹配诊断、问题预测和业务知识补课。',
    icon: '🎯',
    to: '/battle-plan',
  },
  {
    title: '经历库',
    desc: '保存你已经整理好的经历，也可以从 PDF 简历批量导入经历。',
    detail: '这些经历会在生成面试手册时作为真实素材注入上下文。',
    icon: '📁',
    to: '/library',
  },
  {
    title: '岗位库',
    desc: '按公司和岗位保存每一次准备结果，之后可以继续生成或更新。',
    detail: '一条岗位记录包含聊天、面试手册、知识体系和更新时间。',
    icon: '💼',
    to: '/jobs',
  },
]

const flow = [
  '先把经历整理进经历库',
  '粘贴目标岗位 JD',
  '确认 JD 拆解并生成面试手册',
  '单独生成知识体系',
  '保存到岗位库，持续更新',
]

export default function Home() {
  const navigate = useNavigate()
  const { isConfigured, setShowSettings, experiences } = useApp()
  const jobs = getJobs()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <section className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">求职备战助手</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
              这是一个本地化的求职准备工作台：左边沉淀你的真实经历，右边围绕具体岗位生成面试手册、知识体系，并按岗位归档。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/experience')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              开始整理经历
            </button>
            <button
              onClick={() => navigate('/battle-plan')}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
            >
              粘贴 JD 备战
            </button>
          </div>
        </div>
      </section>

      {!isConfigured && (
        <div className="mb-6 p-4 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div className="flex-1 text-sm">
            <p className="font-medium text-orange-800">先设置 API Key</p>
            <p className="text-orange-600 text-xs mt-0.5">支持 DeepSeek、OpenAI、Kimi、通义千问、Claude，Key 只保存在本地浏览器。</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 shrink-0"
          >
            去设置
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400">已整理经历</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{experiences.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400">已保存岗位</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{jobs.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 md:col-span-2">
          <p className="text-xs text-gray-400">推荐流程</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {flow.map((item, i) => (
              <span key={item} className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                <span className="text-gray-400">{i + 1}</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {actions.map(action => (
          <button
            key={action.to}
            onClick={() => navigate(action.to)}
            className="text-left rounded-xl border border-gray-100 bg-white p-5 hover:border-blue-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center text-xl shrink-0">
                {action.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900">{action.title}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">{action.desc}</p>
                <p className="mt-2 text-xs leading-5 text-gray-400">{action.detail}</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-amber-100 bg-amber-50/70 p-5">
        <div className="flex gap-3">
          <span className="text-xl shrink-0">🔒</span>
          <div>
            <h2 className="text-sm font-semibold text-amber-900">数据保存说明</h2>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              你的经历、岗位记录、面试手册、知识体系和 API Key 都保存在当前浏览器本地，不会上传到这个网页自己的服务器。
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-700">
              如果清理浏览器数据、更换浏览器或设备、使用隐身模式、卸载浏览器，或者浏览器自动清理站点数据，这些内容可能会消失。重要的面试手册和知识体系建议用页面里的“复制”按钮备份到自己的文档。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
