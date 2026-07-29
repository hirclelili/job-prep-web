function safeFileName(value = '经历档案') {
  return String(value || '经历档案')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '经历档案'
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function list(values = []) {
  return values.filter(Boolean).map(value => `- ${value}`).join('\n')
}

function projectToMarkdown(project, index) {
  const lines = [`### ${project.name || `项目 ${index + 1}`}`]
  if (project.background) lines.push(`\n#### 背景与目标\n\n${project.background}`)
  if (project.my_role) lines.push(`\n#### 我的角色\n\n${project.my_role}`)
  const actions = [
    ...(project.owned || []),
    ...(project.actions || []),
    ...(project.contributed || []).map(item => `协作：${item}`),
  ]
  if (actions.length) lines.push(`\n#### 我的工作过程\n\n${list(actions)}`)
  if (project.decisions?.length) lines.push(`\n#### 关键判断与推进\n\n${list(project.decisions)}`)
  const evidence = [...(project.deliverables || []), ...(project.evidence || [])]
  if (evidence.length) lines.push(`\n#### 结果与证据\n\n${list(evidence)}`)
  if (project.open_questions?.length) lines.push(`\n#### 仍待确认\n\n${list(project.open_questions)}`)
  return lines.join('\n')
}

export function buildExperienceMarkdown(experience = {}) {
  if (experience.dossier_markdown?.trim()) return experience.dossier_markdown.trim()

  const title = experience.title
    || [experience.company, experience.role, experience.time].filter(Boolean).join(' · ')
    || '经历档案'
  const lines = [
    '# 完整经历档案',
    '',
    '## 第一部分：经历档案底稿',
    '',
    '### 基础信息',
    `- 经历名称：${title}`,
    `- 类型：${experience.type || '[待补充]'}`,
    `- 公司/项目：${experience.company || '[待补充]'}`,
    `- 角色：${experience.role || '[待补充]'}`,
    `- 时间：${experience.time || '[待补充]'}`,
  ]
  if (experience.one_line_summary) {
    lines.push('', '### 经历主线', '', experience.one_line_summary)
  }
  const projects = Array.isArray(experience.project_breakdown) ? experience.project_breakdown : []
  projects.forEach((project, index) => lines.push('', projectToMarkdown(project, index)))

  if (experience.resume_bullets?.length) {
    lines.push(
      '',
      '## 第二部分：简历版',
      '',
      [experience.company, experience.role, experience.time].filter(Boolean).join('｜'),
      '',
      list(experience.resume_bullets),
    )
  }
  if (experience.full_story) {
    lines.push('', '## 第三部分：完整经历故事', '', experience.full_story)
  }
  const opening = experience.interview_opening || experience.star_story
  if (opening || experience.followup_questions?.length) {
    lines.push('', '## 第四部分：面试工具包')
    if (opening) lines.push('', '### 30 秒开场', '', opening)
    if (experience.followup_questions?.length) {
      lines.push('', '### 预测追问与应对', '')
      experience.followup_questions.forEach((item, index) => {
        lines.push(
          `**追问 ${index + 1}：** ${item.question || item.q || item}`,
          '',
          `应对：${item.answer || item.a || '[待补充]'}`,
          '',
        )
      })
    }
  }
  return lines.join('\n').trim()
}

function documentHtml({ title, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171321; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.75; }
    main { max-width: 820px; margin: 0 auto; }
    h1 { margin: 0 0 24px; font-size: 28px; }
    h2 { margin: 28px 0 14px; border-bottom: 2px solid #171321; padding-bottom: 7px; font-size: 20px; }
    h3 { margin: 22px 0 10px; font-size: 17px; }
    h4 { margin: 16px 0 7px; font-size: 14px; }
    p { margin: 7px 0; }
    ul, ol { margin: 7px 0; padding-left: 22px; }
    li { margin: 4px 0; }
    blockquote { margin: 10px 0; border-left: 3px solid #ff5cc8; padding: 8px 12px; color: #62596e; background: #fff5fb; }
    pre, code { white-space: pre-wrap; word-break: break-word; }
    button { display: none !important; }
    .prep-panel-tight { border: 0 !important; box-shadow: none !important; background: transparent !important; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`
}

export function downloadExperienceMarkdown({ title, markdown }) {
  downloadBlob(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    `${safeFileName(title)}.md`,
  )
}

export function downloadExperienceWord({ title, documentElement }) {
  if (!documentElement) return
  const html = documentHtml({ title, body: documentElement.innerHTML })
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
    `${safeFileName(title)}.doc`,
  )
}

export function printExperiencePdf({ title, documentElement }) {
  if (!documentElement) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('浏览器拦截了导出窗口，请允许弹窗后重试。')
  printWindow.opener = null
  printWindow.document.open()
  printWindow.document.write(documentHtml({ title, body: documentElement.innerHTML }))
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => printWindow.print(), 250)
}
