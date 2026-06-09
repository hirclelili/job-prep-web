const SETTINGS_KEY = 'job_prep_settings'
const EXPERIENCES_KEY = 'job_prep_experiences'
const JOBS_KEY = 'job_prep_jobs'

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function getExperiences() {
  try {
    return JSON.parse(localStorage.getItem(EXPERIENCES_KEY)) || []
  } catch {
    return []
  }
}

/**
 * Save or update an experience.
 * If exp.id exists and matches an entry, that entry is updated (merge).
 * Otherwise a new entry is created.
 * status defaults to 'optimized' unless explicitly set.
 */
export function saveExperience(exp) {
  const list = getExperiences()
  const id = exp.id || `exp-${Date.now()}`
  const existing = list.findIndex(e => e.id === id)
  const item = {
    status: 'optimized',   // default for manual / deep-processed entries
    ...exp,
    id,
    savedAt: new Date().toISOString(),
  }
  if (existing >= 0) {
    list[existing] = item
  } else {
    list.unshift(item)
  }
  localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(list))
  return item
}

/**
 * Bulk-save imported experiences (from PDF parse).
 * Sets status = 'imported' and won't overwrite existing optimized entries.
 */
export function bulkImportExperiences(exps) {
  const list = getExperiences()
  const newItems = exps.map((exp, i) => ({
    status: 'imported',
    star_story: '',
    key_metrics: [],
    highlights: [],
    skills_demonstrated: [],
    ...exp,
    // AI returns field as 'bullets'; our internal model uses 'resume_bullets'
    resume_bullets: exp.bullets || exp.resume_bullets || [],
    title: exp.title || [exp.company, exp.role, exp.time].filter(Boolean).join(' · '),
    id: exp.id || `exp-import-${Date.now()}-${i}`,
    savedAt: new Date().toISOString(),
  }))
  // Prepend new items (don't touch existing)
  const merged = [...newItems, ...list]
  localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(merged))
  return newItems
}

export function deleteExperience(id) {
  const list = getExperiences().filter(e => e.id !== id)
  localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(list))
}

export function getJobs() {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY)) || []
  } catch {
    return []
  }
}

export function getJob(id) {
  return getJobs().find(job => job.id === id) || null
}

export function saveJob(job) {
  const list = getJobs()
  const now = new Date().toISOString()
  const id = job.id || `job-${Date.now()}`
  const existing = list.findIndex(j => j.id === id)
  const item = {
    ...job,
    id,
    title: job.title || '未命名岗位',
    createdAt: job.createdAt || now,
    updatedAt: now,
  }
  if (existing >= 0) {
    list[existing] = item
  } else {
    list.unshift(item)
  }
  localStorage.setItem(JOBS_KEY, JSON.stringify(list))
  return item
}

export function deleteJob(id) {
  const list = getJobs().filter(j => j.id !== id)
  localStorage.setItem(JOBS_KEY, JSON.stringify(list))
}
