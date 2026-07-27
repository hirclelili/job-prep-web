import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Keep key interview-question labels visually separated in markdown output.
function normalizeMarkdown(text) {
  const fieldLabels = [
    '考察点',
    '难度',
    '应答策略',
    '面试官想看到的信号',
    '常见踩坑',
    '回答示例',
    '一句话理解',
    '概念说明',
    '典型应用场景',
    '在这个岗位里怎么用',
    '常见指标/判断标准',
    '举个例子',
    '面试中可以怎么表达',
  ].join('|')
  const fieldPattern = new RegExp(`(\\*{0,2}(?:${fieldLabels})\\*{0,2}[：:])`, 'g')
  const needsLeadingBlank = new RegExp(`^\\s*\\*{0,2}(?:${fieldLabels})\\*{0,2}[：:]`)
  return text
    .replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '')
    // Models sometimes place several knowledge fields on one physical line.
    // Split them before Markdown parsing so every field becomes its own paragraph.
    .replace(fieldPattern, '\n\n$1')
    .trim()
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
  const handle = async (e) => {
    e?.stopPropagation()
    await navigator.clipboard.writeText(stripMarkdown(text))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handle} className="prep-ghost flex min-h-[30px] items-center gap-1 px-3">
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function Section({ title, content, defaultOpen = true, onRewrite }) {
  const [open, setOpen] = useState(defaultOpen)
  const handleRewrite = (e) => {
    e.stopPropagation()
    onRewrite?.()
  }
  return (
    <div className="prep-panel-tight mb-3 overflow-hidden">
      <div className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-white/80" onClick={() => setOpen(o => !o)}>
        <span className="text-sm font-black text-[#171321]">{title}</span>
        <div className="flex items-center gap-2">
          {onRewrite && (
            <button
              onClick={handleRewrite}
              className="prep-secondary min-h-[30px] px-3"
            >
              优化
            </button>
          )}
          {open && <CopyButton text={content} />}
          <svg className={`h-4 w-4 text-[#8a8296] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#171321]/10 px-4 py-3">
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

function splitExperienceSections(markdown) {
  const lines = markdown.split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    const isH2 = line.startsWith('## ') && !line.startsWith('### ')
    const isH3 = line.startsWith('### ')
    if (isH2 || isH3) {
      if (current) sections.push(current)
      current = {
        title: isH2 ? line.slice(3).trim() : line.slice(4).trim(),
        level: isH2 ? 2 : 3,
        lines: [],
      }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
    .map(s => ({ title: s.title, level: s.level, content: s.lines.join('\n').trim() }))
    .filter(s => s.content)
}

function MindMap({ data }) {
  if (!data?.title || !Array.isArray(data.modules) || data.modules.length === 0) return null
  return (
    <div className="prep-panel-tight mb-4 overflow-x-auto p-4">
      <div className="flex min-w-[720px] items-center gap-5">
        <div className="w-44 shrink-0 rounded-2xl bg-[#171321] px-4 py-3 text-center text-sm font-black text-white shadow-[6px_6px_0_rgba(85,223,241,0.22)]">
          {data.title}
        </div>
        <div className="h-1 w-8 shrink-0 rounded-full bg-[#55dff1]" />
        <div className="grid flex-1 gap-3">
          {data.modules.map((module, i) => (
            <div key={`${module.title}-${i}`} className="flex items-center gap-3">
              <div className="w-48 shrink-0 rounded-2xl border border-[#171321]/10 bg-white/82 px-3 py-2 text-sm font-black text-[#171321] shadow-sm">
                {module.title}
              </div>
              <div className="h-1 w-5 shrink-0 rounded-full bg-[#ff5cc8]/60" />
              <div className="flex flex-wrap gap-2">
                {(module.concepts || []).map((concept, j) => (
                  <span key={`${concept}-${j}`} className="prep-chip bg-white/78">
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

function KnowledgeOutput({ content, onRewriteSection }) {
  const { mindMap, markdown } = extractMindMap(content)
  const sections = splitKnowledgeSections(markdown)
  const visibleSections = sections.filter(s => s.title !== '知识体系地图')
  return (
    <>
      <MindMap data={mindMap} />
      {visibleSections.length > 0 ? (
        visibleSections.map((s, i) => (
          <Section
            key={i}
            title={s.title}
            content={s.content}
            defaultOpen={i < 2}
            onRewrite={onRewriteSection ? () => onRewriteSection({
              type: 'knowledge',
              title: s.title,
              content: s.content,
              index: i,
            }) : null}
          />
        ))
      ) : (
        <div className="prose text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(markdown)}</ReactMarkdown>
        </div>
      )}
    </>
  )
}

export default function OutputPanel({ content, emptyText = '这里会显示整理好的内容', actions, variant = 'default', onRewriteSection }) {
  if (!content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-[#8a8296]">
        <span className="flex h-12 w-10 items-center justify-center rounded-2xl bg-[#171321] text-[10px] font-black text-white shadow-[5px_5px_0_rgba(255,92,200,0.20)]">DOC</span>
        <p className="whitespace-pre-line text-sm font-semibold leading-7">{emptyText}</p>
      </div>
    )
  }
  const displayContent = content.replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '').trim()
  const sections = variant === 'experience' ? splitExperienceSections(displayContent) : splitSections(displayContent)
  const hasSections = sections.some(s => s.title !== '__preamble')
  return (
    <div className="h-full overflow-y-auto">
      {actions && <div className="flex items-center gap-2 border-b border-[#171321]/10 px-4 pb-3 pt-4">{actions}</div>}
      <div className="px-4 py-4">
        {variant === 'knowledge' ? (
          <KnowledgeOutput content={displayContent} onRewriteSection={onRewriteSection} />
        ) : hasSections ? (
          sections.map((s, i) => {
            if (s.title === '__preamble') return null
            return (
              <Section
                key={i}
                title={s.title}
                content={s.content}
                defaultOpen={i < 3}
                onRewrite={onRewriteSection ? () => onRewriteSection({
                  type: variant === 'experience' ? 'experience' : 'manual',
                  title: s.title,
                  content: s.content,
                  index: i,
                  level: s.level || 1,
                }) : null}
              />
            )
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
        <div className="mt-4 flex justify-end border-t border-[#171321]/10 pt-4">
          <CopyButton text={displayContent} />
        </div>
      </div>
    </div>
  )
}
