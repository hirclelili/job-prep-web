import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Use local worker bundled by Vite — no CDN dependency
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * Extract plain text from a PDF File object.
 * Returns { text, pageCount } or throws on failure.
 */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageCount = pdf.numPages

  const pageTexts = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Group items by approximate Y position to reconstruct lines
    const lines = {}
    for (const item of content.items) {
      if (!item.str) continue
      const y = Math.round(item.transform[5])
      if (!lines[y]) lines[y] = []
      lines[y].push(item.str)
    }

    // Sort lines top-to-bottom (descending Y in PDF coords)
    const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a)
    const pageText = sortedY.map(y => lines[y].join(' ')).join('\n')
    pageTexts.push(pageText)
  }

  return { text: pageTexts.join('\n\n'), pageCount }
}
