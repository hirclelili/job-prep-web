export const journeySteps = [
  { id: 'import', title: '简历导入', path: '/import', group: '我的经历', desc: '把已有简历变成可整理材料' },
  { id: 'research', title: '经历调研', path: '/experience', group: '我的经历', desc: '逐段追问，把经历问透' },
  { id: 'assets', title: '经历资产', path: '/library', group: '我的经历', desc: '沉淀 STAR、亮点和素材' },
  { id: 'direction', title: '选岗位方向', path: '/directions', group: '投递准备', desc: '判断更适合投什么' },
  { id: 'resume', title: '简历版本', path: '/resumes', group: '投递准备', desc: '生成面向方向或 JD 的简历' },
  { id: 'job', title: '岗位', path: '/jobs', group: '岗位', desc: '保存具体 JD，沉淀每个岗位的材料索引' },
  { id: 'interview', title: '面试准备', path: '/interviews', group: '面试准备', desc: '选择具体岗位，进入面试手册和知识体系工作区' },
]

export function getStep(id) {
  return journeySteps.find(step => step.id === id)
}
