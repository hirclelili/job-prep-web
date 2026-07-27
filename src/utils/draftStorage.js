const DRAFT_VERSION = 1

export const DRAFT_KEYS = {
  direction: 'job_prep_draft_direction',
  resume: 'job_prep_draft_resume',
  resumeImport: 'job_prep_draft_resume_import',
  experienceRewrite: scopeId => `job_prep_draft_experience_rewrite:${safeKeyPart(scopeId)}`,
  interviewRewrite: jobId => `job_prep_draft_interview_rewrite:${safeKeyPart(jobId)}`,
}

function safeKeyPart(value) {
  return String(value || 'draft').replace(/[^\w:.-]/g, '_')
}

export function readDraft(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    if (!parsed || parsed.version !== DRAFT_VERSION || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(key, data) {
  try {
    const payload = {
      version: DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      data,
    }
    localStorage.setItem(key, JSON.stringify(payload))
    return payload
  } catch {
    return null
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

export function formatDraftTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
