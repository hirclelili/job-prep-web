import { experienceAssetStructuringSkill } from './assetSkills'
import { battlePlanChatSkill, knowledgeAppendSkill, knowledgeSystemSkill, sectionRewriteSkill } from './battlePlanSkills'
import { directionAnalysisSkill } from './directionSkills'
import {
  experienceDeepDiveSkill,
  experienceEvidenceSynthesisSkill,
  experienceOverviewGenerateSkill,
  experienceProjectDossierGenerateSkill,
  experienceProjectStoryGenerateSkill,
  experienceResearchStateSynthesisSkill,
  experienceSectionRewriteSkill,
} from './experienceSkills'
import { jobOpportunityParseSkill } from './jobOpportunitySkills'
import { resumeParserSkill } from './resumeParserSkill'
import { resumeDirectionRecommendationSkill, resumeGenerateSkill, resumeLocalRewriteSkill, resumeReviewSkill, resumeStrategyRefineSkill, resumeStrategySkill } from './resumeSkills'

export const skillRegistry = [
  {
    stage: 'import',
    stageName: '简历导入',
    skills: [resumeParserSkill],
  },
  {
    stage: 'research',
    stageName: '经历调研',
    skills: [
      experienceDeepDiveSkill,
      experienceResearchStateSynthesisSkill,
      experienceEvidenceSynthesisSkill,
      experienceOverviewGenerateSkill,
      experienceProjectDossierGenerateSkill,
      experienceProjectStoryGenerateSkill,
      experienceSectionRewriteSkill,
    ],
  },
  {
    stage: 'assets',
    stageName: '经历资产',
    skills: [experienceAssetStructuringSkill],
  },
  {
    stage: 'direction',
    stageName: '选岗位方向',
    skills: [directionAnalysisSkill],
  },
  {
    stage: 'resume',
    stageName: '简历版本',
    skills: [resumeDirectionRecommendationSkill, resumeStrategySkill, resumeStrategyRefineSkill, resumeGenerateSkill, resumeLocalRewriteSkill, resumeReviewSkill],
  },
  {
    stage: 'job',
    stageName: '岗位',
    skills: [jobOpportunityParseSkill],
  },
  {
    stage: 'interview',
    stageName: '面试准备',
    skills: [battlePlanChatSkill, knowledgeSystemSkill, knowledgeAppendSkill, sectionRewriteSkill],
  },
]

export function getSkillsByStage(stage) {
  return skillRegistry.find(item => item.stage === stage)?.skills || []
}

export function getSkillById(id) {
  return skillRegistry.flatMap(item => item.skills).find(skill => skill.id === id) || null
}
