#!/usr/bin/env node
/**
 * build-site.mjs —— 把仓库里的抽取产物整理成 Quartz 可构建的内容树
 *
 * 输入：
 *   data/markdown/<id>.md    645 篇原文（含评论）
 *   逐篇摘要/<id>.md          645 篇抽取摘要
 *   文章核心信息.md            主索引（按主题/标签/实体/时间线分章）
 *   核心思想综合报告.md        22 个主题的跨文章综合
 *   提取概览.md                方法与统计说明
 *   extracted/posts.jsonl      抽取结果（用于 frontmatter 元数据）
 *
 * 输出：
 *   content/index.md          站点首页
 *   content/original/<id>.md  原文
 *   content/summary/<id>.md   摘要
 *   content/report/*.md       三份报告（链接已改写为站点内相对路径）
 *
 * 说明：Quartz 的 slug 保留中文，但为了 URL 干净，目录名使用 ASCII（original/summary/report），
 * 页面标题、正文、标签全部为中文。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const CONTENT = path.join(ROOT, "content")
const MD_DIR = path.join(ROOT, "data", "markdown")
const PER_DIR = path.join(ROOT, "逐篇摘要")
const POSTS = path.join(ROOT, "extracted", "posts.jsonl")

const DIRS = {
  original: path.join(CONTENT, "original"),
  summary: path.join(CONTENT, "summary"),
  report: path.join(CONTENT, "report"),
}

const REPORTS = [
  { src: "核心思想综合报告.md", out: "核心思想综合报告.md", title: "核心思想综合报告" },
  { src: "文章核心信息.md", out: "文章核心信息.md", title: "文章核心信息总索引" },
  { src: "提取概览.md", out: "提取概览.md", title: "提取方法与数据概览" },
]

/** YAML 标量安全引用 */
function yamlString(v) {
  if (v === null || v === undefined) return '""'
  const s = String(v)
  if (s === "") return '""'
  if (/^[\s]|[\s]$/.test(s)) return JSON.stringify(s)
  if (/[:#\[\]{}&*!|>'"%@`,\n]/.test(s)) return JSON.stringify(s)
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return JSON.stringify(s)
  if (/^-?\d+(\.\d+)?$/.test(s)) return JSON.stringify(s)
  return s
}

function yamlList(arr) {
  if (!arr || arr.length === 0) return "[]"
  return "\n" + arr.map((x) => `  - ${yamlString(x)}`).join("\n")
}

function frontmatter(obj) {
  const lines = ["---"]
  lines.push(`title: ${yamlString(obj.title)}`)
  if (obj.date) lines.push(`date: ${yamlString(obj.date)}`)
  if (obj.description) lines.push(`description: ${yamlString(obj.description)}`)
  if (obj.tags && obj.tags.length) {
    lines.push("tags:")
    for (const t of obj.tags) lines.push(`  - ${yamlString(t)}`)
  }
  lines.push("---")
  return lines.join("\n")
}

/** 去掉原文件的首个 H1（Quartz 用 frontmatter.title 作为标题） */
function stripLeadingH1(md) {
  return md.replace(/^#\s+.*\r?\n+/, "")
}

/** 把 `逐篇摘要/<id>.md` 形式的链接改写成站点内相对路径 `../summary/<id>` */
function rewriteLinks(md, depth = 1) {
  const up = "../".repeat(depth)
  return md
    .replace(/\]\(逐篇摘要\/(\d+)\.md\)/g, `](${up}summary/$1)`)
    .replace(/\]\(\.\/逐篇摘要\/(\d+)\.md\)/g, `](${up}summary/$1)`)
}

/**
 * 正文里的 `#标签` 会被 Quartz 当作 Obsidian 标签，为每个原始标签生成一个标签页。
 * 抽取产物的原始标签有 1768 种（碎片化），会炸出 533MB 的标签页，因此改成行内代码显示，
 * 只保留 frontmatter 里的「主题/类型」共 30 个标签参与导航。
 */
function escapeHashtags(md) {
  return md.replace(
    /(?<=^| )#((?:[-_\p{L}\p{Emoji}\p{M}\d])+(?:\/[-_\p{L}\p{Emoji}\p{M}\d]+)*)/gmu,
    (_m, tag) => `\`${tag}\``,
  )
}

function readPosts() {
  const rows = []
  for (const line of fs.readFileSync(POSTS, "utf8").split("\n")) {
    const t = line.trim()
    if (!t) continue
    rows.push(JSON.parse(t))
  }
  return rows
}

function main() {
  // 清理旧内容
  fs.rmSync(CONTENT, { recursive: true, force: true })
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true })

  const posts = readPosts()
  const byId = new Map(posts.map((p) => [String(p.id), p]))
  const meta = JSON.parse(
    fs.readFileSync(path.join(ROOT, "extracted", "site_meta.json"), "utf8"),
  )
  const themeOf = new Map(Object.entries(meta.themeById))

  let nOriginal = 0
  let nSummary = 0

  // ---- 原文 ----
  for (const id of byId.keys()) {
    const p = byId.get(id)
    const src = path.join(MD_DIR, `${id}.md`)
    if (!fs.existsSync(src)) continue
    let md = fs.readFileSync(src, "utf8")
    const theme = themeOf.get(id) || "其他杂谈"
    const fm = frontmatter({
      title: p.title && p.title !== "(无标题)" ? p.title : `帖子 ${id}`,
      date: p.createdAt ? p.createdAt.slice(0, 10) : null,
      description: p.tldr || "",
      tags: [`主题/${theme}`, `类型/${p.type || "其他"}`],
    })
    md = `${fm}\n\n${escapeHashtags(stripLeadingH1(md).trim())}\n`
    // 文末追加「对应摘要」链接
    md += `\n\n---\n\n[查看本篇抽取摘要 →](../summary/${id})\n`
    fs.writeFileSync(path.join(DIRS.original, `${id}.md`), md)
    nOriginal++
  }

  // ---- 摘要 ----
  for (const id of byId.keys()) {
    const p = byId.get(id)
    const src = path.join(PER_DIR, `${id}.md`)
    if (!fs.existsSync(src)) continue
    let md = fs.readFileSync(src, "utf8")
    const theme = themeOf.get(id) || "其他杂谈"
    const fm = frontmatter({
      title: p.title && p.title !== "(无标题)" ? p.title : `帖子 ${id}`,
      date: p.createdAt ? p.createdAt.slice(0, 10) : null,
      description: p.tldr || "",
      tags: [`主题/${theme}`, `类型/${p.type || "其他"}`],
    })
    md = `${fm}\n\n${escapeHashtags(stripLeadingH1(md).trim())}\n`
    md += `\n\n---\n\n[查看本篇原文（含评论）→](../original/${id})\n`
    fs.writeFileSync(path.join(DIRS.summary, `${id}.md`), md)
    nSummary++
  }

  // ---- 报告 ----
  for (const r of REPORTS) {
    const src = path.join(ROOT, r.src)
    if (!fs.existsSync(src)) continue
    let md = fs.readFileSync(src, "utf8")
    md = escapeHashtags(rewriteLinks(md, 1))
    const fm = frontmatter({
      title: r.title,
      description: r.title === "核心思想综合报告"
        ? "645 篇文章按 22 个主题聚类后的跨文章综合：每个主题的核心主张、关键数据与可执行动作。"
        : r.title === "文章核心信息总索引"
          ? "按类型、主题、标签、标的、时间线组织的 645 篇文章核心信息总索引。"
          : "抽取所用 skill、关键工程决策、统计口径与质量验证。",
      tags: ["报告"],
    })
    md = `${fm}\n\n${stripLeadingH1(md).trim()}\n`
    fs.writeFileSync(path.join(DIRS.report, r.out), md)
  }

  // ---- 首页 ----
  const stat = meta.stats
  const typeRows = stat.types
    .map((t) => `| ${t.name} | ${t.count} | ${((t.count / stat.total) * 100).toFixed(1)}% |`)
    .join("\n")
  const themeRows = stat.themes
    .map((t) => `| ${t.name} | ${t.count} | ${((t.count / stat.total) * 100).toFixed(1)}% |`)
    .join("\n")

  const index = `---
title: 且慢社区「ETF拯救世界」图文帖知识库
description: 645 篇长赢指数投资计划主理人的帖子原文 + 抽取的核心思想、要点、数据点与可执行动作，附 22 个主题的跨文章综合报告。
tags:
  - 首页
---

# 且慢社区「ETF拯救世界」图文帖知识库

本库收录 **${stat.total} 篇** 且慢社区用户「ETF拯救世界」（长赢指数投资计划主理人）的图文帖，时间跨度
**${stat.dateFrom} ~ ${stat.dateFrom.slice(0, 4) === stat.dateTo.slice(0, 4) ? stat.dateTo : stat.dateTo}**，
并用 GitHub 上的开源 skill \`content-enrich\` 的方法抽出每篇的有效信息与核心思想。

## 快速入口

- [[report/核心思想综合报告|📘 核心思想综合报告]] —— 22 个主题的跨文章综合：核心主张、关键数据、可执行动作
- [[report/文章核心信息|📗 文章核心信息总索引]] —— 按类型 / 主题 / 标签 / 标的 / 时间线组织的全量索引
- [[report/提取概览|🧭 提取方法与数据概览]] —— skill 选型、关键工程决策、质量验证

## 两种读法

| 入口 | 内容 | 适合 |
| --- | --- | --- |
| **原文** | 帖子正文 + 抓取到的精选评论（含作者回复） | 想看作者原话与社区争论 |
| **摘要** | 核心思想、要点、作者观点、数据点、实体、可执行动作、价值判断 | 想快速吸收结论 |

每一篇的摘要末尾都链回原文，原文末尾链回摘要。共 **${nOriginal} 篇原文 + ${nSummary} 篇摘要**。

## 内容类型分布

| 类型 | 篇数 | 占比 |
| --- | --- | --- |
${typeRows}

## 主题分布

| 主题 | 篇数 | 占比 |
| --- | --- | --- |
${themeRows}

## 抽取口径速览

- **核心思想**：一句话概括这篇在讲什么（含「信息量有限」标注）
- **要点**：3~8 条，区分正文与评论区
- **数据点**：原文出现过的可核对数值（持仓比例、指数点位、涨跌幅）
- **实体**：涉及的指数 / 基金 / 板块 / 人物
- **可执行动作**：读完能直接做的下一步
- **价值判断**：对读者是否值得读、读到什么

数值保真率 **99.0%**（抽取出的数字可回溯原文），验收 24 项全部通过。

## 数据与隐私说明

- 评论者昵称已按「严格词边界」规则替换为 \`读者NNN\` 假名；正文里的中奖名单等原始内容保持原样
- 访问令牌与内部网关地址已从代码中移除，改为环境变量注入
- 数据来源：且慢社区公开接口，仅供学习研究，不构成投资建议
`
  fs.writeFileSync(path.join(CONTENT, "index.md"), index)

  console.log(
    `[build-site] 完成：原文 ${nOriginal} 篇、摘要 ${nSummary} 篇、报告 ${REPORTS.length} 份、首页 1 份`,
  )
}

main()
