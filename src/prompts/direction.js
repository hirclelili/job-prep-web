function formatExperience(exp, index) {
  return [
    `经历${index + 1}: ${exp.title || [exp.company, exp.role, exp.time].filter(Boolean).join(' · ') || '未命名经历'}`,
    exp.company ? `公司/项目：${exp.company}` : '',
    exp.role ? `角色：${exp.role}` : '',
    exp.time ? `时间：${exp.time}` : '',
    exp.status ? `资产状态：${exp.status === 'imported' ? '仅导入，尚未深挖' : '已深挖/已优化'}` : '',
    exp.resume_bullets?.length ? `简历条目：\n${exp.resume_bullets.map(item => `- ${item}`).join('\n')}` : '',
    exp.highlights?.length ? `核心亮点：${exp.highlights.join('；')}` : '',
    exp.skills_demonstrated?.length ? `能力标签：${exp.skills_demonstrated.join('、')}` : '',
    exp.key_metrics?.length ? `关键数据：${exp.key_metrics.join('、')}` : '',
    exp.star_story ? `STAR/口述素材：${exp.star_story}` : '',
  ].filter(Boolean).join('\n')
}

export function buildDirectionExperienceContext(experiences) {
  if (!experiences?.length) return '用户还没有经历资产。'
  return experiences.map(formatExperience).join('\n\n---\n\n')
}

export function getDirectionAnalysisSystem() {
  return `你是一个求职方向定位顾问。你的任务是基于用户已经沉淀的经历资产，判断更适合优先尝试哪些岗位方向，并说明为什么。

【核心原则】
- 只基于用户提供的经历资产判断，不要编造经历、能力或数据。
- 不要把所有方向都说适合，要有优先级和取舍。
- 不要只看岗位名称，要看经历里体现出的能力、业务场景、成果证据和信息缺口。
- 如果经历还没有深挖，要明确提示判断置信度较低，并指出应该回到经历调研补什么。
- 关键词初筛只能作为参考，不能被关键词命中数量完全绑架。
- 输出要帮助用户决定“第一版简历先做什么方向”，不要泛泛罗列行业。
- 输出是 Markdown，不要输出 JSON。

【输出格式】
# 岗位方向分析

## 方向优先级
用表格输出 3-5 个方向：
| 优先级 | 方向 | 推荐程度 | 为什么适合 | 主要证据 | 风险/短板 |
|---|---|---|---|---|---|

推荐程度只能用：强 / 中 / 弱。
每个方向必须有明确证据；证据不足要写“证据不足”，不要硬夸。

## 最建议先投的方向
给出 1 个最建议先尝试的方向，说明原因。

## 第一版简历建议
说明第一版简历应该怎么定位，主打哪 2-3 段经历，弱化哪些内容。

## 可以探索但不要主攻的方向
列出 1-3 个可以探索但暂时不建议作为主线的方向。

## 经历资产缺口
列出会影响方向判断和后续简历质量的信息缺口，每条都要指向具体经历。

## 下一步行动
给出具体建议：
- 哪些经历需要回到经历调研继续问
- 第一版简历应该生成什么方向
- 如果用户已经有 JD，应该怎么用 JD 来修正方向判断`
}

export function buildDirectionAnalysisPrompt({ experiences, keywordRanking }) {
  return [
    '请基于以下经历资产，分析用户更适合优先尝试哪些岗位方向。',
    keywordRanking?.length ? `【关键词初筛结果】\n${keywordRanking.map((item, index) => `${index + 1}. ${item.name}：命中 ${item.score} 个关键词（${item.matches?.join('、') || '无'}）`).join('\n')}` : '',
    '【经历资产】\n' + buildDirectionExperienceContext(experiences || []),
  ].filter(Boolean).join('\n\n')
}
