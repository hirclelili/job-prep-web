import { DRAFT_KEYS, readDraft } from '../utils/draftStorage'
import { getExperiences, getJobs, getProfile, getResumes } from '../utils/storage'

function readText(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function experienceName(experience = {}) {
  return experience.title
    || [experience.company, experience.role, experience.time].filter(Boolean).join(' · ')
    || '未命名经历'
}

function countEvidence(experience = {}) {
  return [
    ...(experience.resume_bullets || experience.bullets || []),
    ...(experience.key_metrics || []),
    ...(experience.highlights || []),
    ...(experience.skills_demonstrated || []),
  ].filter(Boolean).length
}

function summarizeExperience(experience = {}) {
  const projects = Array.isArray(experience.project_breakdown)
    ? experience.project_breakdown
    : []
  const openQuestions = experience.open_questions
    || experience.pending_questions
    || experience.evidence_gaps
    || experience.still_needed
    || []

  return {
    id: experience.id,
    name: experienceName(experience),
    type: experience.type || 'experience',
    status: experience.status || 'imported',
    company: experience.company || '',
    role: experience.role || '',
    time: experience.time || '',
    projectCount: projects.length,
    projectNames: projects.map(project => project.name).filter(Boolean).slice(0, 6),
    bulletCount: (experience.resume_bullets || experience.bullets || []).length,
    evidenceCount: countEvidence(experience),
    hasStory: !!(experience.full_story || experience.star_story || experience.interview_opening),
    openQuestions: Array.isArray(openQuestions) ? openQuestions.slice(0, 5) : [],
  }
}

function resolveCurrentExperience(context, experiences) {
  const id = context.currentExperienceId || ''
  if (id) return experiences.find(item => item.id === id) || null
  const scope = String(context.currentExperienceScope || '')
  return experiences.find(item => scope && scope.includes(item.id)) || null
}

function resolveCurrentJob(context, jobs, workspace) {
  const id = context.currentJobId || context.jobId || workspace.currentJobId
  return jobs.find(item => item.id === id) || null
}

function resolveCurrentResume(context, resumes, resumeDraft) {
  const id = context.currentResumeId || context.resumeId || resumeDraft?.activeResumeId
  return resumes.find(item => item.id === id) || null
}

function buildDiagnosis({ experiences, resumes, jobs, resumeDraft, currentExperience, currentJob }) {
  const pending = experiences.filter(item => item.status === 'imported')
  const optimized = experiences.filter(item => item.status !== 'imported')

  if (!experiences.length) {
    return {
      stage: '经历输入',
      blocker: '还没有经历资产',
      suggestedAction: '先导入简历，把原始经历拆成独立资产。',
    }
  }
  if (currentExperience && currentExperience.status === 'imported') {
    return {
      stage: '经历调研',
      blocker: `${experienceName(currentExperience)} 仍是原始材料`,
      suggestedAction: '围绕这段经历继续追问，完成后由用户确认保存。',
    }
  }
  if (currentJob && !currentJob.interviewManual && !currentJob.manualText) {
    return {
      stage: '岗位准备',
      blocker: `${currentJob.title || '当前岗位'} 尚未生成面试手册`,
      suggestedAction: '先确认 JD 拆解，再生成面试手册。',
    }
  }
  if (resumeDraft?.resumeStrategy && !resumeDraft?.confirmedStrategy) {
    return {
      stage: '简历选材',
      blocker: '选材策略尚未确认',
      suggestedAction: '在简历页调整经历、顺序和强调角度后确认生成。',
    }
  }
  if (pending.length) {
    return {
      stage: '经历资产',
      blocker: `${pending.length} 条经历仍待调研`,
      suggestedAction: `优先补充证据最少的经历；当前已有 ${optimized.length} 条完成深挖。`,
    }
  }
  if (!resumes.length && !resumeDraft?.outputText) {
    return {
      stage: '简历版本',
      blocker: '还没有完整简历版本',
      suggestedAction: '先选择岗位方向，再确认选材策略并生成第一版简历。',
    }
  }
  if (!jobs.length) {
    return {
      stage: '岗位机会',
      blocker: '岗位库还没有 JD',
      suggestedAction: '有具体机会时保存 JD；不影响继续完善经历和方向版简历。',
    }
  }
  return {
    stage: '持续准备',
    blocker: '',
    suggestedAction: '根据当前目标继续完善经历、简历或具体岗位材料。',
  }
}

export function getAgentWorkspaceSnapshot(context = {}) {
  const profile = getProfile()
  const experiences = getExperiences()
  const resumes = getResumes()
  const jobs = getJobs()
  const resumeDraftEnvelope = readDraft(DRAFT_KEYS.resume)
  const directionDraftEnvelope = readDraft(DRAFT_KEYS.direction)
  const importDraftEnvelope = readDraft(DRAFT_KEYS.resumeImport)
  const resumeDraft = resumeDraftEnvelope?.data || {}
  const directionDraft = directionDraftEnvelope?.data || {}
  const workspace = {
    currentJobId: readText('job_prep_current_job_id'),
    currentJobTitle: readText('job_prep_current_job_title'),
    experienceOutput: '',
    interviewOutput: readText('job_prep_interview_output'),
    knowledgeOutput: readText('job_prep_knowledge_output'),
  }
  const experienceScope = context.currentExperienceId || context.currentExperienceScope || ''
  if (experienceScope) {
    const safeScope = String(experienceScope).replace(/[^\w:.-]/g, '_')
    workspace.experienceOutput = readText(`job_prep_exp_output:${safeScope}`)
  }
  if (!workspace.experienceOutput) workspace.experienceOutput = readText('job_prep_exp_output')

  const currentExperience = resolveCurrentExperience(context, experiences)
  const currentJob = resolveCurrentJob(context, jobs, workspace)
  const currentResume = resolveCurrentResume(context, resumes, resumeDraft)
  const experienceItems = experiences.map(summarizeExperience)
  const diagnosis = buildDiagnosis({
    experiences,
    resumes,
    jobs,
    resumeDraft,
    currentExperience,
    currentJob,
  })

  return {
    page: {
      path: context.currentPath || '',
      stage: context.stage || '',
      instruction: context.pageInstruction || '',
      currentOutputStatus: context.currentOutputStatus || '',
    },
    profile: {
      name: profile.name || '',
      hasContact: !!(profile.email || profile.phone),
      educationCount: profile.education?.length || 0,
      skillCount: profile.skills?.length || 0,
      summaryPresent: !!profile.summary,
    },
    experiences: {
      total: experiences.length,
      optimized: experienceItems.filter(item => item.status !== 'imported').length,
      pending: experienceItems.filter(item => item.status === 'imported').length,
      items: experienceItems,
      current: currentExperience ? summarizeExperience(currentExperience) : null,
      currentDraftPresent: !!workspace.experienceOutput.trim(),
    },
    directions: {
      recommendationCount: directionDraft.recommendations?.length || resumeDraft.directionRecommendations?.length || 0,
      customDirection: directionDraft.customDirection || resumeDraft.customTarget || '',
      updatedAt: directionDraftEnvelope?.updatedAt || '',
    },
    resumes: {
      total: resumes.length,
      items: resumes.slice(0, 12).map(resume => ({
        id: resume.id,
        title: resume.title || '未命名简历',
        target: resume.target || resume.directionProfile?.name || '',
        strategyMode: resume.strategyMode || resume.confirmedStrategy?.target?.mode || '',
        jobId: resume.jobId || '',
        updatedAt: resume.updatedAt || '',
      })),
      current: currentResume ? {
        id: currentResume.id,
        title: currentResume.title,
        target: currentResume.target || currentResume.directionProfile?.name || '',
      } : null,
      draft: resumeDraftEnvelope ? {
        target: resumeDraft.customTarget || resumeDraft.target || '',
        strategyMode: resumeDraft.strategyMode || '',
        hasStrategy: !!resumeDraft.resumeStrategy,
        strategyConfirmed: !!resumeDraft.confirmedStrategy,
        hasOutput: !!resumeDraft.outputText?.trim(),
        activeResumeId: resumeDraft.activeResumeId || '',
        jobId: resumeDraft.jobId || '',
        updatedAt: resumeDraftEnvelope.updatedAt,
      } : null,
    },
    jobs: {
      total: jobs.length,
      items: jobs.slice(0, 12).map(job => ({
        id: job.id,
        title: job.title || '未命名岗位',
        company: job.company || '',
        role: job.role || '',
        hasJd: !!job.jdText?.trim(),
        hasResume: resumes.some(resume => resume.jobId === job.id),
        hasManual: !!(job.interviewManual || job.manualText)?.trim(),
        hasKnowledge: !!(job.knowledgeSystem || job.knowledgeText)?.trim(),
        updatedAt: job.updatedAt || '',
      })),
      current: currentJob ? {
        id: currentJob.id,
        title: currentJob.title,
        company: currentJob.company || '',
        role: currentJob.role || '',
        hasJd: !!currentJob.jdText?.trim(),
        hasManual: !!(currentJob.interviewManual || currentJob.manualText)?.trim(),
        hasKnowledge: !!(currentJob.knowledgeSystem || currentJob.knowledgeText)?.trim(),
      } : null,
      currentManualDraftPresent: !!workspace.interviewOutput.trim(),
      currentKnowledgeDraftPresent: !!workspace.knowledgeOutput.trim(),
    },
    drafts: {
      resumeImportPresent: !!importDraftEnvelope,
      directionPresent: !!directionDraftEnvelope,
      resumePresent: !!resumeDraftEnvelope,
    },
    diagnosis,
  }
}

export function formatAgentWorkspaceSnapshot(snapshot) {
  const experienceLines = snapshot.experiences.items.slice(0, 12).map(item => (
    `- ${item.id}｜${item.name}｜${item.type}｜${item.status === 'imported' ? '待调研' : '已深挖'}｜项目 ${item.projectCount}｜bullet ${item.bulletCount}｜证据 ${item.evidenceCount}`
  ))
  const jobLines = snapshot.jobs.items.slice(0, 8).map(item => (
    `- ${item.id}｜${item.title}｜JD ${item.hasJd ? '有' : '无'}｜简历 ${item.hasResume ? '有' : '无'}｜手册 ${item.hasManual ? '有' : '无'}｜知识 ${item.hasKnowledge ? '有' : '无'}`
  ))
  const resumeLines = snapshot.resumes.items.slice(0, 8).map(item => (
    `- ${item.id}｜${item.title}｜方向 ${item.target || '未标注'}｜${item.strategyMode || '旧版本'}`
  ))

  return [
    `当前页面：${snapshot.page.stage || '未标注'} ${snapshot.page.path || ''}`,
    snapshot.experiences.current ? `当前经历：${snapshot.experiences.current.name}（${snapshot.experiences.current.status === 'imported' ? '待调研' : '已深挖'}）` : '',
    snapshot.jobs.current ? `当前岗位：${snapshot.jobs.current.title}` : '',
    snapshot.resumes.current ? `当前简历：${snapshot.resumes.current.title}` : '',
    `系统诊断：${snapshot.diagnosis.stage}；${snapshot.diagnosis.blocker || '无明确阻塞'}；${snapshot.diagnosis.suggestedAction}`,
    `基础资料：${snapshot.profile.name || '未填写姓名'}；联系方式 ${snapshot.profile.hasContact ? '有' : '无'}；教育 ${snapshot.profile.educationCount}；技能 ${snapshot.profile.skillCount}`,
    `经历资产：${snapshot.experiences.optimized}/${snapshot.experiences.total} 已深挖`,
    ...experienceLines,
    `简历版本：${snapshot.resumes.total}`,
    ...resumeLines,
    snapshot.resumes.draft
      ? `简历草稿：方向 ${snapshot.resumes.draft.target || '未选'}；策略 ${snapshot.resumes.draft.hasStrategy ? (snapshot.resumes.draft.strategyConfirmed ? '已确认' : '待确认') : '未生成'}；正文 ${snapshot.resumes.draft.hasOutput ? '已有' : '无'}`
      : '简历草稿：无',
    `岗位：${snapshot.jobs.total}`,
    ...jobLines,
  ].filter(Boolean).join('\n')
}
