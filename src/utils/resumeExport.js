import { removeEmptyResumeSections } from './resumeNormalize'

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
}

function inlineMarkdown(text = '') {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '$1')
}

function stripGeneratedHeader(markdown = '') {
  const lines = markdown.split('\n')
  if (/^#\s+/.test(lines[0]?.trim() || '')) {
    lines.shift()
    while (lines[0]?.trim() === '') lines.shift()
    if (lines[0] && /[｜|@]|电话|手机|邮箱|Email|Phone/i.test(lines[0])) lines.shift()
  }
  return lines.join('\n')
}

function markdownToWordHtml(markdown = '') {
  const lines = removeEmptyResumeSections(stripGeneratedHeader(markdown))
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
  const html = []
  let inList = false
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false } }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeList(); continue }
    if (/^#{1,6}\s+/.test(line)) {
      closeList()
      const level = line.match(/^#+/)[0].length
      const text = inlineMarkdown(line.replace(/^#{1,6}\s+/, ''))
      if (level === 1) html.push('<h1>' + text + '</h1>')
      else if (level === 2) html.push('<h2>' + text + '</h2>')
      else html.push('<h3>' + text + '</h3>')
      continue
    }
    if (/^[-*•]\s+/.test(line)) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push('<li>' + inlineMarkdown(line.replace(/^[-*•]\s+/, '')) + '</li>')
      continue
    }
    closeList()
    html.push('<p>' + inlineMarkdown(line) + '</p>')
  }
  closeList()
  return html.join('\n')
}

function safeFileName(name = '简历版本') {
  return name.replace(/[\\/:*?\"<>|]/g, '_').slice(0, 80) || '简历版本'
}

function contactLine(profile = {}) {
  return [profile.phone, profile.email, profile.city, ...(profile.links || [])]
    .filter(Boolean)
    .map(escapeHtml)
    .join('｜')
}

export function resumeCss(forExport = false) {
  return '@page { size: A4; margin: 0; }' +
    '* { box-sizing: border-box; }' +
    'body { margin: 0; background: ' + (forExport ? '#ffffff' : '#f3f4f6') + '; color: #111827; font-family: \"Microsoft YaHei\", \"PingFang SC\", Arial, sans-serif; }' +
    '.resume-page { position: relative; width: 794px; height: 1123px; overflow: hidden; margin: ' + (forExport ? '0' : '24px auto') + '; padding: 52px 58px 54px; background: #fff; box-shadow: ' + (forExport ? 'none' : '0 18px 45px rgba(15, 23, 42, 0.10)') + '; }' +
    '.resume-scale { width: 100%; transform: scale(var(--resume-scale, 1)); transform-origin: top left; }' +
    '.resume-header { display: flex; justify-content: space-between; gap: 26px; min-height: 94px; padding-bottom: 0; }' +
    '.resume-identity { flex: 1; min-width: 0; }' +
    '.resume-name { margin: 0; font-size: 30px; line-height: 1.12; font-weight: 800; letter-spacing: 0; text-align: left; }' +
    '.resume-contact { display: inline-block; width: fit-content; max-width: 100%; margin-top: 7px; padding-bottom: 7px; border-bottom: 2px solid #111827; color: #374151; font-size: 12.8px; line-height: 1.5; word-break: break-word; }' +
    '.resume-summary { margin-top: 7px; color: #4b5563; font-size: 12.8px; line-height: 1.5; }' +
    '.resume-photo { width: 82px; height: 108px; object-fit: cover; border: 1px solid #d1d5db; background: #f9fafb; }' +
    '.resume-body { padding-top: 0; }' +
    '.resume-body h1 { display: none; }' +
    '.resume-body h2 { margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #111827; font-size: 15.5px; line-height: 1.24; font-weight: 800; }' +
    '.resume-body h2:first-child { margin-top: 6px; }' +
    '.resume-body h3 { margin: 9px 0 4px; font-size: 13.5px; line-height: 1.32; font-weight: 800; }' +
    '.resume-body p { margin: 3px 0; font-size: 12.3px; line-height: 1.5; }' +
    '.resume-body ul { margin: 3px 0 7px 18px; padding: 0; }' +
    '.resume-body li { margin: 2px 0; font-size: 12.3px; line-height: 1.48; }' +
    '.resume-body strong { font-weight: 800; }' +
    '.resume-page[data-fit=\"spacious\"] .resume-body h2 { margin-top: 18px; margin-bottom: 7px; }' +
    '.resume-page[data-fit=\"spacious\"] .resume-body h2:first-child { margin-top: 7px; }' +
    '.resume-page[data-fit=\"spacious\"] .resume-body h3 { margin-top: 11px; }' +
    '.resume-page[data-fit=\"spacious\"] .resume-body li { line-height: 1.56; margin-top: 3px; margin-bottom: 3px; }' +
    '.resume-page[data-fit=\"spacious\"] .resume-body p { line-height: 1.58; }' +
    '.resume-page[data-fit=\"compact\"] { padding-top: 48px; padding-bottom: 48px; }' +
    '.resume-page[data-fit=\"compact\"] .resume-header { min-height: 88px; padding-bottom: 10px; }' +
    '.resume-page[data-fit=\"compact\"] .resume-body h2 { margin-top: 12px; }' +
    '.resume-page[data-fit=\"compact\"] .resume-body h2:first-child { margin-top: 5px; }' +
    '.resume-page[data-fit=\"compact\"] .resume-body li { line-height: 1.42; }' +
    '@media print { body { background: #fff; } .resume-page { margin: 0; box-shadow: none; width: 210mm; height: 297mm; padding: 14mm 15mm 14mm; } }'
}

function resumeFitScript() {
  return '<script>' +
    '(function(){' +
    'function fit(){' +
    'var page=document.querySelector(".resume-page");var scaleBox=document.querySelector(".resume-scale");if(!page||!scaleBox)return;' +
    'page.style.setProperty("--resume-scale","1");page.dataset.fit="normal";' +
    'var style=getComputedStyle(page);var available=page.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);var content=scaleBox.scrollHeight;' +
    'if(content<available*0.86){page.dataset.fit="spacious";content=scaleBox.scrollHeight;}' +
    'if(content>available){page.dataset.fit="compact";content=scaleBox.scrollHeight;}' +
    'var scale=content>0?Math.min(1,available/content):1;' +
    'if(scale<0.78)scale=0.78;' +
    'page.style.setProperty("--resume-scale",String(scale));' +
    'window.__resumeReady=true;window.dispatchEvent(new Event("resume-ready"));' +
    '}' +
    'window.addEventListener("load",function(){setTimeout(fit,40);setTimeout(fit,180);});' +
    'window.addEventListener("resize",fit);' +
    'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}' +
    '})();' +
    '</script>'
}

export function buildResumeDocumentHtml({ title = '简历版本', content = '', profile = {}, forExport = false }) {
  const body = markdownToWordHtml(content)
  const name = profile.name || content.match(/^#\s+(.+)$/m)?.[1]?.trim() || title
  const photo = profile.photoDataUrl ? '<img class=\"resume-photo\" src=\"' + profile.photoDataUrl + '\" alt=\"photo\" />' : ''
  const contacts = contactLine(profile)
  const summary = profile.summary ? '<div class=\"resume-summary\">' + escapeHtml(profile.summary) + '</div>' : ''
  return '<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>' + escapeHtml(title) + '</title><style>' + resumeCss(forExport) + '</style></head><body>' +
    '<article class=\"resume-page\"><div class=\"resume-scale\"><header class=\"resume-header\"><div class=\"resume-identity\">' +
    '<h1 class=\"resume-name\">' + escapeHtml(name) + '</h1>' +
    (contacts ? '<div class=\"resume-contact\">' + contacts + '</div>' : '') + summary +
    '</div>' + photo + '</header><main class=\"resume-body\">' + body + '</main></div></article>' + resumeFitScript() + '</body></html>'
}

export function downloadResumeWord({ title, content, profile }) {
  const html = buildResumeDocumentHtml({ title, content, profile, forExport: true })
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFileName(title) + '.doc'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadResumePdf({ title, content, profile }) {
  const html = buildResumeDocumentHtml({ title, content, profile, forExport: true })
  const win = window.open('', '_blank')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  let printed = false
  const printWhenReady = () => {
    if (printed) return
    try {
      if (win.__resumeReady) {
        printed = true
        win.print()
        return
      }
    } catch {}
    setTimeout(() => {
      if (printed) return
      printed = true
      win.print()
    }, 500)
  }
  win.addEventListener?.('resume-ready', () => setTimeout(printWhenReady, 80), { once: true })
  setTimeout(printWhenReady, 700)
}

export async function downloadResumeImage({ title, content, profile }) {
  const html = buildResumeDocumentHtml({ title, content, profile, forExport: true }).replace(/<script>[\s\S]*?<\/script>/g, '')
  const wrapped = '<div xmlns=\"http://www.w3.org/1999/xhtml\" style=\"width:794px;background:white\">' + html + '</div>'
  const svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"794\" height=\"1123\"><foreignObject width=\"100%\" height=\"100%\">' + wrapped + '</foreignObject></svg>'
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })
  const canvas = document.createElement('canvas')
  canvas.width = 794
  canvas.height = 1123
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = safeFileName(title) + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
