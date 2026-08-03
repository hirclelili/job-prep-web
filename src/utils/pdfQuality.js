const RESUME_SIGNALS = [
  /教育|education/i,
  /实习|工作|经历|experience|employment/i,
  /项目|project/i,
  /技能|skills/i,
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
  /20\d{2}[./-]\d{1,2}/,
]

export function assessPDFTextQuality({ text = '', pageCount = 0, skippedPages = [], pages = [] } = {}) {
  const visibleText = String(text).replace(/\s/g, '')
  const lines = String(text).split('\n').map(line => line.trim()).filter(Boolean)
  const badCharacters = String(text).match(/�|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []
  const badCharacterRatio = badCharacters.length / Math.max(visibleText.length, 1)
  const tinyLineRatio = lines.length > 0
    ? lines.filter(line => line.length <= 2).length / lines.length
    : 1
  const pageRows = pages.length > 0
    ? pages
    : [{ page: 1, text, charCount: visibleText.length }]
  const emptyPages = pageRows.filter(page => page.charCount < 20).map(page => page.page)
  const coveredPages = Math.max(0, pageCount - emptyPages.length - skippedPages.length)
  const signalCount = RESUME_SIGNALS.filter(pattern => pattern.test(text)).length

  const expectedTextLength = Math.max(150, pageCount * 120)
  const volumeScore = Math.min(25, visibleText.length / expectedTextLength * 25)
  const healthScore = Math.max(0, 25 - badCharacterRatio * 1000)
  const coherenceScore = lines.length > 20
    ? Math.max(0, 20 - tinyLineRatio * 35)
    : 20
  const coverageScore = pageCount > 0 ? Math.min(10, coveredPages / pageCount * 10) : 0
  const signalScore = Math.min(20, signalCount * 4)
  const score = Math.round(volumeScore + healthScore + coherenceScore + coverageScore + signalScore)

  const reasons = []
  if (visibleText.length < 150) reasons.push('提取到的有效文字过少')
  if (skippedPages.length > 0) reasons.push(`有 ${skippedPages.length} 页读取失败`)
  if (emptyPages.length > 0) reasons.push(`有 ${emptyPages.length} 页几乎没有文字`)
  if (badCharacterRatio > 0.015) reasons.push('文字中包含较多乱码')
  if (lines.length > 20 && tinyLineRatio > 0.45) reasons.push('文字被拆成大量碎片')
  if (score < 55 && reasons.length === 0) reasons.push('简历结构信号较弱')

  return {
    score,
    shouldEnhance: reasons.length > 0 || score < 55,
    reasons,
    metrics: {
      visibleCharacters: visibleText.length,
      badCharacterRatio,
      tinyLineRatio,
      signalCount,
      emptyPages,
    },
  }
}
