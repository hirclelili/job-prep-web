import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MinerU } from 'mineru-open-sdk'

const MAX_FILE_SIZE = 4 * 1024 * 1024
const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 6

const runtimeState = globalThis.__JOB_PREP_MINERU_STATE__ || { rateLimits: new Map() }
globalThis.__JOB_PREP_MINERU_STATE__ = runtimeState

export const config = {
  api: { bodyParser: false },
}

function setCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '')
  const host = String(req.headers.host || '')
  try {
    if (origin && new URL(origin).host === host) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
  } catch {}
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name')
}

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

function isRateLimited(req) {
  const now = Date.now()
  const key = getClientKey(req)
  const current = runtimeState.rateLimits.get(key)
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    runtimeState.rateLimits.set(key, { startedAt: now, count: 1 })
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT
}

async function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (req.body instanceof Uint8Array) return Buffer.from(req.body)
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_FILE_SIZE) throw new Error('file_too_large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function safeFilename(value = '') {
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch {}
  const cleaned = String(decoded).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned || 'resume'}.pdf`
}

function errorMessage(error) {
  if (error?.message === 'file_too_large' || error?.name === 'FlashFileTooLargeError') {
    return 'PDF 文件过大，增强解析暂时支持 4MB 以内的简历。'
  }
  if (error?.name === 'FlashPageLimitError') return 'PDF 页数超过增强解析限制。'
  if (error?.name === 'FlashUnsupportedTypeError') return '增强解析不支持这个 PDF 文件。'
  if (/rate limit|RATE_LIMITED|429/i.test(error?.message || '')) return '增强解析请求较多，请稍后重试。'
  if (/timeout/i.test(error?.message || '') || error?.name === 'TimeoutError') return '增强解析等待超时，请稍后重试。'
  return error?.message || '增强解析暂时不可用。'
}

export default async function handler(req, res) {
  setCorsHeaders(req, res)
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: '只支持上传 PDF。' })
  if (isRateLimited(req)) return res.status(429).json({ ok: false, message: '增强解析请求较多，请稍后重试。' })
  if (!String(req.headers['content-type'] || '').includes('application/pdf')) {
    return res.status(415).json({ ok: false, message: '请上传 PDF 文件。' })
  }

  let tempPath = ''
  try {
    const body = await readRequestBody(req)
    if (!body.length) return res.status(400).json({ ok: false, message: '上传的 PDF 文件为空。' })
    if (body.length > MAX_FILE_SIZE) return res.status(413).json({ ok: false, message: 'PDF 文件超过 4MB。' })

    const filename = safeFilename(req.headers['x-file-name'])
    tempPath = join('/tmp', `${randomUUID()}-${filename}`)
    await writeFile(tempPath, body)

    const client = new MinerU()
    client.setSource('job-prep-web')
    const result = await client.flashExtract(tempPath, {
      language: 'ch',
      ocr: true,
      formula: false,
      table: false,
      timeout: 50,
    })

    if (result.state !== 'done' || !result.markdown?.trim()) {
      throw new Error(result.error || '增强解析没有返回有效内容。')
    }
    return res.status(200).json({
      ok: true,
      provider: 'mineru-flash',
      markdown: result.markdown.trim(),
    })
  } catch (error) {
    return res.status(502).json({ ok: false, message: errorMessage(error) })
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => {})
  }
}
