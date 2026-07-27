import { runTextSkill } from '../skills/core'
import { getSkillById, skillRegistry } from '../skills/registry'
import { streamChat } from '../services/llm'
import { getJobSearchEnrichment } from '../services/search'
import {
  getExperiences,
  getJobs,
  getProfile,
  getResumes,
  saveExperience,
  saveJob,
  saveProfile,
  saveResume,
} from '../utils/storage'
import { emitAgentArtifact } from './events'
import { appendAgentMemoryNote, getAgentMemory, saveAgentMemory } from './memory'
import { getAgentWorkspaceSnapshot } from './state'

function summarizeList(list, mapper, limit = 8) {
  return (list || []).slice(0, limit).map(mapper)
}

function safeScopeId(value) {
  return String(value || '').replace(/[^\w:.-]/g, '_')
}

function readCurrentWorkspace(context = {}) {
  const read = key => {
    try { return localStorage.getItem(key) || '' } catch { return '' }
  }
  const experienceScope = context.currentExperienceId || context.currentExperienceScope || ''
  const scopedExperienceOutput = experienceScope
    ? read(`job_prep_exp_output:${safeScopeId(experienceScope)}`)
    : ''
  const experienceOutput = scopedExperienceOutput || read('job_prep_exp_output')
  const interviewOutput = read('job_prep_interview_output')
  const knowledgeOutput = read('job_prep_knowledge_output')
  return {
    experienceOutput,
    interviewOutput,
    knowledgeOutput,
    activeBattleOutput: read('job_prep_battle_active_output'),
    currentJobId: read('job_prep_current_job_id'),
    currentJobTitle: read('job_prep_current_job_title'),
    hasExperienceOutput: !!experienceOutput.trim(),
    hasInterviewOutput: !!interviewOutput.trim(),
    hasKnowledgeOutput: !!knowledgeOutput.trim(),
  }
}

function stripManualCompleteMarker(text = '') {
  return text.replace(/<!--\s*MANUAL_COMPLETE\s*-->/g, '').trim()
}

function getResultText(result) {
  if (typeof result === 'string') return result
  if (typeof result?.text === 'string') return result.text
  if (result && typeof result === 'object') return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
  return ''
}

function inferArtifactTarget(skillId, input, context) {
  if (input?.artifactTarget) return input.artifactTarget
  if (context?.artifactTarget) return context.artifactTarget
  if (skillId === 'direction.analyze.fit') return 'direction.analysis'
  if (skillId === 'resume.direction.recommend') return 'resume.directions'
  if (skillId === 'resume.strategy.analyze' || skillId === 'resume.strategy.refine') return 'resume.strategy'
  if (skillId === 'resume.generate') return 'resume.output'
  if (skillId === 'resume.review') return 'resume.review'
  if (skillId === 'battle_plan.knowledge.generate' || skillId === 'battle_plan.knowledge.append') return 'knowledge.output'
  if (skillId === 'battle_plan.manual.chat') return 'interview.output'
  if (skillId === 'experience.deep_dive.chat') return 'experience.output'
  return ''
}

function hydrateSkillInput(skillId, input = {}, context = {}) {
  const workspace = readCurrentWorkspace(context)
  const experiences = getExperiences()
  const base = {
    ...context,
    ...(input || {}),
  }

  if (!base.artifactTarget) base.artifactTarget = inferArtifactTarget(skillId, input, context)
  if (!base.artifactTitle && context.artifactTitle) base.artifactTitle = context.artifactTitle

  if (skillId.startsWith('resume.')) {
    if (!base.profile) base.profile = getProfile()
    if (!base.experiences?.length) base.experiences = experiences
    if (!base.jdText) base.jdText = context.jdText || ''
    if (!base.resumeStrategy) base.resumeStrategy = context.resumeStrategy || null
    if (!base.confirmedStrategy) base.confirmedStrategy = context.confirmedStrategy || null
    if (!base.targetLabel) {
      base.targetLabel = base.target
        || base.confirmedStrategy?.target?.label
        || base.resumeStrategy?.target?.label
        || context.targetLabel
        || '通用实习简历'
    }
    if (!base.targetSource) {
      base.targetSource = base.confirmedStrategy?.target?.source
        || base.resumeStrategy?.target?.source
        || (base.jdText?.trim() ? 'jd' : 'custom')
    }
    if (!base.strategyMode) {
      base.strategyMode = base.confirmedStrategy?.target?.mode
        || base.resumeStrategy?.target?.mode
        || (base.jdText?.trim() ? 'jd' : (base.targetLabel === '通用实习简历' ? 'baseline' : 'direction'))
    }
    if (!base.outputText) base.outputText = base.resumeOutput || context.resumeOutput || context.resumeOutputPreview || ''
    if (!base.currentResume) base.currentResume = base.resumeOutput || context.resumeOutput || ''
    if (!base.resumeReview) base.resumeReview = context.resumeReview || ''
  }

  if (skillId === 'direction.analyze.fit' && !base.experiences?.length) {
    base.experiences = experiences
  }

  if (skillId === 'battle_plan.manual.chat' && !base.experiences?.length) {
    base.experiences = experiences
  }

  if (skillId === 'battle_plan.knowledge.generate') {
    if (!base.experiences?.length) base.experiences = experiences
    if (!base.manualText) base.manualText = stripManualCompleteMarker(workspace.interviewOutput)
  }

  if (skillId === 'battle_plan.knowledge.append') {
    if (!base.manualText) base.manualText = stripManualCompleteMarker(workspace.interviewOutput)
    if (!base.knowledgeText) base.knowledgeText = workspace.knowledgeOutput
  }

  if (skillId === 'battle_plan.section.rewrite') {
    if (!base.manualText) base.manualText = stripManualCompleteMarker(workspace.interviewOutput)
    if (!base.knowledgeText) base.knowledgeText = workspace.knowledgeOutput
  }

  return base
}

async function enrichGenerationInput(skillId, input = {}) {
  const shouldEnrichResume = skillId.startsWith('resume.') && skillId !== 'resume.direction.recommend'
  const shouldEnrichInterview = skillId === 'battle_plan.manual.chat' || skillId === 'battle_plan.knowledge.generate'
  if ((!shouldEnrichResume && !shouldEnrichInterview) || input.searchContext?.trim()) return input
  if (shouldEnrichResume && !input.jdText?.trim() && !input.jobTitle?.trim()) return input
  if (shouldEnrichInterview && !input.jdText?.trim() && !input.jobTitle?.trim() && !input.targetLabel?.trim()) return input

  const enrichment = await getJobSearchEnrichment({
    purpose: shouldEnrichInterview ? 'interview' : 'resume',
    jobTitle: input.jobTitle || '',
    jdText: input.jdText || '',
    targetLabel: input.targetLabel || '',
  })
  return { ...input, searchContext: enrichment.contextText || '' }
}

export function createAgentTools({ settings, refreshAppState, context = {}, intentGate = {} }) {
  const publishArtifact = ({ type, title, content, source, metadata } = {}) => {
    const artifactType = type || context.artifactTarget
    const artifactContent = content?.trim()
    if (!artifactType || !artifactContent) return null
    if (artifactType === 'resume.output' && !context.confirmedStrategy) return null
    return emitAgentArtifact({
      type: artifactType,
      title: title || context.artifactTitle || '',
      content: artifactContent,
      source: source || 'agent',
      metadata: { ...(metadata || {}), page: context.currentPath || '' },
    })
  }

  const tools = {
    'memory.read': {
      description: '读取长期记忆，包括用户偏好、目标和备注。',
      argsHint: '{}',
      run: async () => getAgentMemory(),
    },
    'memory.save_note': {
      description: '保存一条长期记忆备注。只保存对后续求职准备有价值的信息。',
      argsHint: '{"note":"需要长期记住的信息"}',
      run: async ({ note }) => appendAgentMemoryNote(note),
    },
    'memory.update': {
      description: '更新长期记忆的 goals/preferences/notes。',
      argsHint: '{"preferences":["偏好"],"goals":["目标"],"notes":["备注"]}',
      requiresApproval: true,
      approvalLabel: '更新长期记忆',
      run: async ({ preferences, goals, notes }) => saveAgentMemory({ preferences, goals, notes }),
    },
    'profile.read': {
      description: '读取用户基础信息、教育、技能等。',
      argsHint: '{}',
      run: async () => getProfile(),
    },
    'profile.update': {
      description: '保存或更新用户基础信息、教育、技能、证书、链接等。',
      argsHint: '{"name":"","email":"","phone":"","city":"","summary":"","education":[],"skills":[],"certificates":[],"links":[]}',
      requiresApproval: true,
      approvalLabel: '更新基础信息',
      run: async (profile) => saveProfile(profile || {}),
    },
    'workspace.read': {
      description: '读取完整工作区状态，包括当前页面对象、经历完成度、方向与简历草稿、岗位材料状态和系统诊断。',
      argsHint: '{}',
      run: async () => getAgentWorkspaceSnapshot(context),
    },
    'artifact.publish': {
      description: '把 Agent 生成的完整结果交给当前页面工作区。args 包含 type、content，可选 title/metadata。',
      argsHint: '{"type":"experience.output|direction.analysis|resume.directions|resume.strategy|resume.output|resume.review|interview.output|knowledge.output","title":"","content":"完整内容"}',
      run: async (artifact) => publishArtifact({ ...artifact, source: artifact?.source || 'agent.publish' }) || {
        skipped: true,
        reason: '缺少 type 或 content，未发布。',
      },
    },
    'experiences.read': {
      description: '读取经历资产库。',
      argsHint: '{"limit":12}',
      run: async ({ limit = 12 } = {}) => summarizeList(getExperiences(), exp => ({
        id: exp.id,
        status: exp.status,
        title: exp.title || [exp.company, exp.role, exp.time].filter(Boolean).join(' · '),
        company: exp.company,
        role: exp.role,
        time: exp.time,
        type: exp.type,
        bullets: exp.resume_bullets || exp.bullets || [],
        fullStory: exp.full_story || '',
        story: exp.star_story || '',
        interviewOpening: exp.interview_opening || '',
        highlights: exp.highlights || [],
        skills: exp.skills_demonstrated || [],
        metrics: exp.key_metrics || [],
        projects: exp.project_breakdown || [],
        openQuestions: exp.open_questions || exp.pending_questions || exp.evidence_gaps || [],
      }), limit),
    },
    'experiences.save': {
      description: '保存或更新一条经历资产。用于把深挖后的经历沉淀到经历资产库。',
      argsHint: '{"id":"可选，更新时填写","title":"","company":"","role":"","time":"","resume_bullets":[],"star_story":"","highlights":[],"skills_demonstrated":[],"key_metrics":[]}',
      requiresApproval: true,
      approvalLabel: '保存经历资产',
      run: async (experience) => {
        const saved = saveExperience(experience || {})
        refreshAppState?.()
        return saved
      },
    },
    'resumes.read': {
      description: '读取已有简历版本。',
      argsHint: '{"limit":8}',
      run: async ({ limit = 8 } = {}) => summarizeList(getResumes(), resume => ({
        id: resume.id,
        title: resume.title,
        target: resume.target,
        strategyMode: resume.strategyMode || resume.confirmedStrategy?.target?.mode || '',
        directionProfile: resume.directionProfile || null,
        confirmedStrategy: resume.confirmedStrategy || null,
        jobId: resume.jobId || '',
        updatedAt: resume.updatedAt,
      }), limit),
    },
    'resumes.save': {
      description: '保存或更新一个简历版本。用于把完整简历 Markdown 和对应目标沉淀到简历版本库。',
      argsHint: '{"id":"可选，更新时填写","title":"","target":"","content":"完整简历Markdown","jdText":"","selectedExperienceIds":[]}',
      requiresApproval: true,
      approvalLabel: '保存简历版本',
      run: async (resume) => saveResume(resume || {}),
    },
    'jobs.read': {
      description: '读取岗位库和 JD 记录。',
      argsHint: '{"limit":8}',
      run: async ({ limit = 8 } = {}) => summarizeList(getJobs(), job => ({
        id: job.id,
        title: job.title,
        company: job.company,
        role: job.role,
        updatedAt: job.updatedAt,
        hasJd: !!job.jdText?.trim?.(),
        jdPreview: job.jdText ? job.jdText.slice(0, 240) : '',
        hasManual: !!(job.interviewManual || job.manualText)?.trim?.(),
        hasKnowledge: !!(job.knowledgeSystem || job.knowledgeText)?.trim?.(),
        activeOutput: job.activeOutput,
      }), limit),
    },
    'jobs.save': {
      description: '保存或更新岗位记录。',
      argsHint: '{"id":"可选，更新时填写","title":"","jdText":"","interviewManual":"","knowledgeSystem":"","activeOutput":"battle|knowledge","chatMessages":[]}',
      requiresApproval: true,
      approvalLabel: '保存或更新岗位',
      run: async (job) => {
        const saved = saveJob(job || {})
        refreshAppState?.()
        return saved
      },
    },
    'skill.catalog': {
      description: '查看产品内已封装的专业 skill 列表和 skillId。',
      argsHint: '{}',
      run: async () => skillRegistry.map(stage => ({
        stage: stage.stage,
        stageName: stage.stageName,
        skills: stage.skills.map(skill => ({
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
          interaction: skill.interaction || 'text',
        })),
      })),
    },
    'skill.run': {
      description: '调用现有专业 skill。args 必须包含 skillId，可选 input。系统会自动把当前页面上下文、本地经历、基础信息和草稿补进 input。',
      argsHint: '{"skillId":"direction.analyze.fit|resume.direction.recommend|resume.strategy.analyze|resume.strategy.refine|resume.generate|resume.review|battle_plan.knowledge.generate|battle_plan.knowledge.append","input":{"artifactTarget":"可选"}}',
      run: async ({ skillId, input }) => {
        const skill = getSkillById(skillId)
        if (!skill) throw new Error(`未知 skill：${skillId}`)
        if (skillId === 'resume.generate') {
          throw new Error('完整简历必须在简历页确认选材策略后生成，Agent 只能先提供方向和策略预览。')
        }
        if (skill.interaction === 'chat') {
          throw new Error('当前 skill.run 只支持一次性文本 skill，chat skill 请由 agent 继续对话调度。')
        }
        const hydratedInput = await enrichGenerationInput(
          skillId,
          hydrateSkillInput(skillId, input, context)
        )
        const result = await runTextSkill({ skill, input: hydratedInput, settings })
        const published = publishArtifact({
          type: hydratedInput.artifactTarget,
          title: hydratedInput.artifactTitle || skill.name,
          content: getResultText(result),
          source: skill.id,
          metadata: { skillId },
        })
        return { skillId, text: getResultText(result), published }
      },
    },
    'skill.chat_turn': {
      description: '调用一个 chat 类型 skill 完成当前这一轮对话。args 必须包含 skillId、message，可选 history/input。系统会自动补当前页面上下文和本地资料。',
      argsHint: '{"skillId":"experience.deep_dive.chat|battle_plan.manual.chat","message":"用户本轮输入或要交给该skill处理的内容","input":{"artifactTarget":"可选"}}',
      run: async ({ skillId, message, history = [], input = {} }) => {
        const skill = getSkillById(skillId)
        if (!skill) throw new Error(`未知 skill：${skillId}`)
        if (skill.interaction !== 'chat') {
          throw new Error('skill.chat_turn 只支持 chat 类型 skill。一次性文本 skill 请使用 skill.run。')
        }
        if (!message?.trim()) throw new Error('缺少 message')

        const hydratedInput = await enrichGenerationInput(
          skillId,
          hydrateSkillInput(skillId, input, context)
        )
        const userMessage = skill.buildUserMessage({ ...hydratedInput, message })
        const messages = [
          ...(Array.isArray(history) ? history : []),
          ...(Array.isArray(userMessage) ? userMessage : [{ role: 'user', content: userMessage }]),
        ]
        const gen = streamChat({
          ...settings,
          system: skill.buildSystemPrompt(hydratedInput),
          messages,
        })

        let full = ''
        for await (const chunk of gen) full += chunk
        const published = publishArtifact({
          type: hydratedInput.artifactTarget,
          title: hydratedInput.artifactTitle || skill.name,
          content: full,
          source: skill.id,
          metadata: { skillId },
        })
        return { skillId, text: full, published }
      },
    },
  }

  if (!intentGate.canUseSkill) {
    delete tools['skill.run']
    delete tools['skill.chat_turn']
  }

  if (!intentGate.canPublishArtifact) {
    delete tools['artifact.publish']
  }

  if (!intentGate.canModifyData) {
    delete tools['memory.save_note']
    delete tools['memory.update']
    delete tools['profile.update']
    delete tools['experiences.save']
    delete tools['resumes.save']
    delete tools['jobs.save']
  }

  return tools
}

export function getToolManifest(tools) {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.requiresApproval
      ? `${tool.description} 这个工具会修改归档数据，调用前必须等待用户确认。`
      : tool.description,
    argsHint: tool.argsHint || '{}',
    requiresApproval: !!tool.requiresApproval,
  }))
}
