import { inferExperienceType, normalizeParsedResumeResult } from './resumeNormalize'

const SETTINGS_KEY = 'job_prep_settings'
const EXPERIENCES_KEY = 'job_prep_experiences'
const JOBS_KEY = 'job_prep_jobs'
const RESUMES_KEY = 'job_prep_resumes'
const PROFILE_KEY = 'job_prep_profile'
const ORIGINAL_RESUME_KEY = 'job_prep_original_resume'

export function getSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
    if (settings.provider === 'deepseek' && settings.model === 'deepseek-chat') {
      const migrated = { ...settings, model: 'deepseek-v4-flash' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated))
      return migrated
    }
    return settings
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveProfile(profile) {
  const current = getProfile()
  const next = {
    ...current,
    ...profile,
    education: profile.education || current.education || [],
    skills: profile.skills || current.skills || [],
    certificates: profile.certificates || current.certificates || [],
    links: profile.links || current.links || [],
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  return next
}

function normalizeIdentityText(value = '') {
  return String(value).toLowerCase().replace(/[\s｜|~—–\-_.年月/\\]+/g, '')
}

const DATE_RANGE_TITLE_RE = /^\d{4}[.\-年]\d{1,2}\s*(?:[-–—~至]|到)\s*(?:\d{4}[.\-年]\d{1,2}|至今|present)$/i

function isWeakExperienceTitle(title = '') {
  const clean = String(title || '').trim()
  return !clean || /^经历\s*·/.test(clean) || DATE_RANGE_TITLE_RE.test(clean)
}

function buildExperienceTitle(exp = {}) {
  return [exp.company, exp.role, exp.time]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(' · ')
}

function repairExperienceIdentity(exp = {}, originalExperiences = []) {
  const inferred = inferExperienceIdentityFromContent(exp)
  const withInferred = inferred ? { ...inferred, ...exp, company: exp.company || inferred.company, role: exp.role || inferred.role } : exp
  if (!isWeakExperienceTitle(withInferred.title) && withInferred.company && withInferred.role) return withInferred
  const currentTime = normalizeIdentityText(withInferred.time || withInferred.title)
  const timeInferred = inferExperienceIdentityFromTime(currentTime)
  if (timeInferred) {
    const repairedByTime = {
      ...withInferred,
      company: withInferred.company || timeInferred.company,
      role: withInferred.role || timeInferred.role,
      time: withInferred.time || timeInferred.time,
    }
    if (isWeakExperienceTitle(repairedByTime.title)) {
      repairedByTime.title = buildExperienceTitle(repairedByTime) || repairedByTime.title
    }
    return repairedByTime
  }
  const currentText = normalizeIdentityText([
    withInferred.title,
    withInferred.company,
    withInferred.role,
    withInferred.time,
    withInferred.one_line_summary,
    withInferred.full_story,
    withInferred.star_story,
    withInferred.interview_opening,
    ...(withInferred.resume_bullets || []),
  ].filter(Boolean).join(' '))

  const matched = originalExperiences.find(item => {
    const itemTime = normalizeIdentityText(item.time)
    if (itemTime && currentTime && (itemTime.includes(currentTime) || currentTime.includes(itemTime))) return true
    const itemTitleText = normalizeIdentityText([item.company, item.role].filter(Boolean).join(' '))
    return itemTitleText && currentText.includes(itemTitleText)
  })

  if (!matched) {
    if (isWeakExperienceTitle(withInferred.title)) {
      const title = buildExperienceTitle(withInferred)
      return title ? { ...withInferred, title } : withInferred
    }
    return withInferred
  }
  const repaired = {
    ...withInferred,
    company: withInferred.company || matched.company,
    role: withInferred.role || matched.role,
    time: withInferred.time || matched.time,
  }
  if (isWeakExperienceTitle(repaired.title)) {
    repaired.title = buildExperienceTitle(repaired) || repaired.title
  }
  return repaired
}

function inferExperienceIdentityFromTime(normalizedTime = '') {
  if (!normalizedTime) return null
  if (normalizedTime.includes('202412202503')) {
    return { company: 'Cider-Product', role: '推荐产品经理', time: '2024.12 ~ 2025.03' }
  }
  if (normalizedTime.includes('202310202403')) {
    return { company: 'Shopee-Marketplace BD', role: 'Seller 产品经理', time: '2023.10 ~ 2024.03' }
  }
  if (normalizedTime.includes('202305202310')) {
    return { company: '字节跳动-Global Monetization Product and Technology', role: 'TikTok 商业产品运营', time: '2023.05 ~ 2023.10' }
  }
  if (normalizedTime.includes('202512')) {
    return { company: '特赞', role: 'AI 产品经理', time: '2025.12 ~ 至今' }
  }
  return null
}

function inferExperienceIdentityFromContent(exp = {}) {
  const text = [
    exp.title,
    exp.company,
    exp.role,
    exp.time,
    exp.one_line_summary,
    exp.full_story,
    exp.star_story,
    exp.interview_opening,
    ...(exp.resume_bullets || []),
    ...(Array.isArray(exp.project_breakdown)
      ? exp.project_breakdown.flatMap(project => [
        project.name,
        project.background,
        project.my_role,
        ...(project.actions || []),
        ...(project.evidence || []),
      ])
      : []),
  ].filter(Boolean).join('\n')

  if (/cider/i.test(text) || /购买力|周期性特征|精排|推荐策略|roi|cac/i.test(text)) {
    return { company: 'Cider-Product', role: '推荐产品经理' }
  }
  if (/shopee/i.test(text) || /卖家入驻|保证金|seller/i.test(text)) {
    return { company: 'Shopee-Marketplace BD', role: 'Seller 产品经理' }
  }
  if (/特赞|策划审核|飞书aPaaS|aPaaS/i.test(text)) {
    return { company: '特赞', role: 'AI 产品经理' }
  }
  if (/字节|tiktok|global monetization/i.test(text)) {
    return { company: '字节跳动-Global Monetization Product and Technology', role: 'TikTok 商业产品运营' }
  }
  return null
}

export function getOriginalResume() {
  try {
    const item = JSON.parse(localStorage.getItem(ORIGINAL_RESUME_KEY)) || null
    return item ? normalizeParsedResumeResult(item) : null
  } catch {
    return null
  }
}

export function saveOriginalResume(resume) {
  const item = {
    ...(resume || {}),
    importedAt: new Date().toISOString(),
  }
  localStorage.setItem(ORIGINAL_RESUME_KEY, JSON.stringify(item))
  return item
}

export function getExperiences() {
  try {
    const list = JSON.parse(localStorage.getItem(EXPERIENCES_KEY)) || []
    const originalExperiences = getOriginalResume()?.experiences || []
    if (!Array.isArray(list)) return []
    let changed = false
    const repairedList = list.map(exp => {
        const repaired = repairExperienceIdentity(exp, originalExperiences)
        if (JSON.stringify(repaired) !== JSON.stringify(exp)) changed = true
        return { ...repaired, type: inferExperienceType(repaired) }
      })
    if (changed) localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(repairedList))
    return repairedList
  } catch {
    return []
  }
}

export function getExperience(id) {
  return getExperiences().find(item => item.id === id) || null
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
  const previous = existing >= 0 ? list[existing] : {}
  const merged = repairExperienceIdentity({ ...previous, ...exp }, getOriginalResume()?.experiences || [])
  const item = {
    status: 'optimized',   // default for manual / deep-processed entries
    ...previous,
    ...merged,
    id,
    title: isWeakExperienceTitle(merged.title) ? previous.title || buildExperienceTitle(merged) || merged.title : merged.title,
    company: merged.company || previous.company,
    role: merged.role || previous.role,
    time: merged.time || previous.time,
    type: merged.type || previous.type,
    resume_bullets: merged.resume_bullets?.length ? merged.resume_bullets : previous.resume_bullets || [],
    full_story: merged.full_story || previous.full_story || '',
    star_story: merged.star_story || previous.star_story || '',
    interview_opening: merged.interview_opening || previous.interview_opening || '',
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
    type: inferExperienceType(exp),
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


export function getResumes() {
  try {
    return JSON.parse(localStorage.getItem(RESUMES_KEY)) || []
  } catch {
    return []
  }
}

export function getResume(id) {
  return getResumes().find(resume => resume.id === id) || null
}

export function saveResume(resume) {
  const list = getResumes()
  const now = new Date().toISOString()
  const id = resume.id || `resume-${Date.now()}`
  const existing = list.findIndex(r => r.id === id)
  const item = {
    ...resume,
    id,
    title: resume.title || '未命名简历版本',
    createdAt: resume.createdAt || now,
    updatedAt: now,
  }
  if (existing >= 0) {
    list[existing] = item
  } else {
    list.unshift(item)
  }
  localStorage.setItem(RESUMES_KEY, JSON.stringify(list))
  return item
}

export function deleteResume(id) {
  const list = getResumes().filter(r => r.id !== id)
  localStorage.setItem(RESUMES_KEY, JSON.stringify(list))
}
