import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Keep key interview-question labels visually separated in markdown output.
function normalizeMarkdown(text) {
  const needsLeadingBlank = /^\s*(🎯|❌|💬|\*{0,2}(考察点|难度|应答策略)\*{0,2}[：:])/
  return text
    .replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '')
    .split('\n')
    .reduce((lines, line) => {
      if (needsLeadingBlank.test(line) && lines.length > 0 && lines[lines.length - 1].trim() !== '') {
        lines.push('')
      }
      lines.push(line)
      return lines
    }, [])
    .join('\n')
}

// Strip markdown syntax for clean plain-text copying
function stripMarkdown(text) {
  return text
    .replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')         // *italic* → italic
    .replace(/^#{1,6}\s+/gm, '')            // ## heading → heading
    .replace(/^[-*+]\s+/gm, '• ')          // - item → • item
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/`([^`]+)`/g, '$1')          // `code` → code
    .trim()
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(stripMarkdown(text))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handle} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
      {copied ? <><span>✓</span><span>已复制</span></> : <><span>⎘</span><span>复制</span></>}
    </button>
  )
}

function Section({ title, content, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setOpen(o => !o)}>
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="flex items-center gap-2">
          {open && <CopyButton text={content} />}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {open && (
        <div className="px-4 py-3">
          <div className="prose text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(content)}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

function extractMindMap(markdown) {
  const match = markdown.match(/```(?:mindmap-json|json)\s*([\s\S]*?)\s*```/)
  if (!match) return { mindMap: null, markdown }
  try {
    return {
      mindMap: JSON.parse(match[1]),
      markdown: markdown.replace(match[0], '').trim(),
    }
  } catch {
    return { mindMap: null, markdown: markdown.replace(match[0], '').trim() }
  }
}

function splitSections(markdown) {
  const lines = markdown.split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    const isH1 = line.startsWith('# ') && !line.startsWith('## ')
    const isH2 = line.startsWith('## ')
    if (isH1 || isH2) {
      if (current) sections.push(current)
      current = { title: isH1 ? line.slice(2).trim() : line.slice(3).trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      if (!sections[0] || sections[0].title !== '__preamble') sections.unshift({ title: '__preamble', lines: [] })
      sections[0].lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections.map(s => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

function splitKnowledgeSections(markdown) {
  const lines = markdown.split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    const isH1 = line.startsWith('# ') && !line.startsWith('## ')
    if (isH1) {
      if (current) sections.push(current)
      current = { title: line.slice(2).trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections.map(s => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

function MindMap({ data }) {
  if (!data?.title || !Array.isArray(data.modules) || data.modules.length === 0) return null
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
      <div className="min-w-[720px] flex items-center gap-5">
        <div className="w-44 shrink-0 rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm">
          {data.title}
        </div>
        <div className="h-px w-8 shrink-0 bg-indigo-200" />
        <div className="grid flex-1 gap-3">
          {data.modules.map((module, i) => (
            <div key={`${module.title}-${i}`} className="flex items-center gap-3">
              <div className="w-48 shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm">
                {module.title}
              </div>
              <div className="h-px w-5 shrink-0 bg-indigo-200" />
              <div className="flex flex-wrap gap-2">
                {(module.concepts || []).map((concept, j) => (
                  <span key={`${concept}-${j}`} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KnowledgeOutput({ content }) {
  const { mindMap, markdown } = extractMindMap(content)
  const sections = splitKnowledgeSections(markdown)
  const visibleSections = sections.filter(s => s.title !== '知识体系地图')
  return (
    <>
      <MindMap data={mindMap} />
      {visibleSections.length > 0 ? (
        visibleSections.map((s, i) => (
          <Section key={i} title={s.title} content={s.content} defaultOpen={i < 2} />
        ))
      ) : (
        <div className="prose text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(markdown)}</ReactMarkdown>
        </div>
      )}
    </>
  )
}

export default function OutputPanel({ content, emptyText = '这里会显示整理好的内容', actions, variant = 'default' }) {
  if (!content) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 px-8 text-center gap-2">
        <span className="text-3xl">📄</span>
        <p className="text-sm whitespace-pre-line">{emptyText}</p>
      </div>
    )
  }
  const displayContent = content.replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '').trim()
  const sections = splitSections(displayContent)
  const hasSections = sections.some(s => s.title !== '__preamble')
  return (
    <div className="h-full overflow-y-auto">
      {actions && <div className="px-4 pt-4 pb-2 flex items-center gap-2 border-b border-gray-100">{actions}</div>}
      <div className="px-4 py-4">
        {variant === 'knowledge' ? (
          <KnowledgeOutput content={displayContent} />
        ) : hasSections ? (
          sections.map((s, i) => {
            if (s.title === '__preamble') return null
            return <Section key={i} title={s.title} content={s.content} defaultOpen={i < 3} />
          })
        ) : (
          <div className="relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={displayContent} />
            </div>
            <div className="prose text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(displayContent)}</ReactMarkdown>
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
          <CopyButton text={displayContent} />
        </div>
      </div>
    </div>
  )
}
