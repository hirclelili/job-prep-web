import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { assessPDFTextQuality } from './pdfQuality'

// Use local worker bundled by Vite — no CDN dependency
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

function buildDocumentOptions(arrayBuffer) {
  return {
    data: new Uint8Array(arrayBuffer.slice(0)),
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  }
}

function textContentToLines(content) {
  const rows = []
  for (const item of content.items) {
    if (!item.str || !item.transform) continue
    const x = item.transform[4] || 0
    const y = item.transform[5] || 0
    let row = rows.find(r => Math.abs(r.y - y) <= 2)
    if (!row) {
      row = { y, items: [] }
      rows.push(row)
    }
    row.items.push({ x, text: item.str })
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
    .join('\n')
}

async function extractPageText(page) {
  try {
    return textContentToLines(await page.getTextContent())
  } catch {
    return textContentToLines(await page.getTextContent({ disableNormalization: true }))
  }
}

/**
 * Extract plain text from a PDF File object.
 * Returns { text, pageCount, skippedPages } or throws on failure.
 */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  let pdf
  try {
    pdf = await pdfjsLib.getDocument(buildDocumentOptions(arrayBuffer)).promise
  } catch (err) {
    throw new Error(`无法读取 PDF 文件结构：${err.message}`)
  }

  const pageCount = pdf.numPages
  const pageTexts = []
  const pages = []
  const skippedPages = []

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page = await pdf.getPage(i)
      const pageText = await extractPageText(page)
      pages.push({
        page: i,
        text: pageText,
        charCount: pageText.replace(/\s/g, '').length,
      })
      if (pageText.trim()) pageTexts.push(pageText)
    } catch (err) {
      skippedPages.push({ page: i, error: err.message })
    }
  }

  const text = pageTexts.join('\n\n')
  return {
    text,
    pageCount,
    skippedPages,
    pages,
    quality: assessPDFTextQuality({ text, pageCount, skippedPages, pages }),
  }
}
