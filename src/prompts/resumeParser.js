export const RESUME_PARSER_SYSTEM = `你是一个简历解析器，专门从简历文字中识别和结构化工作/实习/项目经历。`

export function buildParsePrompt(resumeText) {
  return `以下是从PDF简历中提取的文字内容，请识别其中所有的工作、实习、项目经历。

---
${resumeText}
---

请以JSON格式返回，结构如下：

\`\`\`json
{
  "experiences": [
    {
      "company": "公司或项目名称",
      "role": "职位/角色",
      "time": "时间区间（保持原格式）",
      "bullets": [
        "这段经历下的描述文字1（保持原文，不要修改或合并）",
        "这段经历下的描述文字2"
      ],
      "type": "internship 或 fulltime 或 project 或 campus"
    }
  ]
}
\`\`\`

**关于 bullets 的提取规则（重要）**：
- 提取这段经历下的所有描述性内容，不管格式是 ·、-、•、数字编号，还是没有符号的段落
- 每个独立的描述点单独放一条，不要合并
- 保持原文，不要改写、不要优化、不要删减
- 哪怕只是一段话描述工作内容，也要提取进来
- 只有真的没有任何描述文字时，bullets 才留空数组 []

**其他规则**：
- 只提取工作/实习/项目经历，不要提取教育背景、技能列表、证书等
- 按时间倒序排列（最近的在前）
- type：internship（实习）/ fulltime（全职）/ project（项目）/ campus（校园）`
}
