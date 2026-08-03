const MAX_MINERU_FILE_SIZE = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 55 * 1000

export async function extractResumeWithMinerU(file) {
  if (!file) throw new Error('没有可解析的 PDF 文件')
  if (file.size > MAX_MINERU_FILE_SIZE) {
    throw new Error('增强解析暂时只支持 4MB 以内的 PDF')
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch('/api/mineru-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent(file.name || 'resume.pdf'),
      },
      body: file,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `增强解析失败（${response.status}）`)
    }
    if (!payload.markdown?.trim()) throw new Error('增强解析没有返回可识别文字')
    return {
      text: payload.markdown.trim(),
      provider: 'mineru-flash',
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('增强解析等待超时，请稍后重试')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
