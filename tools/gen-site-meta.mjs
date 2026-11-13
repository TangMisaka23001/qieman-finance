#!/usr/bin/env node
/**
 * gen-site-meta.mjs —— 为 Quartz 站点生成 extracted/site_meta.json
 *
 * 内容：
 *   themeById : { 帖子ID -> 主题名 }   （用 tools/themes.mjs 的 assignTheme 重算，与报告口径一致）
 *   stats     : 总数 / 时间范围 / 类型分布 / 主题分布
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assignTheme } from "./themes.mjs"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC = path.join(ROOT, "extracted", "posts.jsonl")
const OUT = path.join(ROOT, "extracted", "site_meta.json")

const rows = []
for (const line of fs.readFileSync(SRC, "utf8").split("\n")) {
  const t = line.trim()
  if (t) rows.push(JSON.parse(t))
}

const themeById = {}
const typeCount = new Map()
const themeCount = new Map()
let dateFrom = null
let dateTo = null

for (const r of rows) {
  const id = String(r.id)
  const theme = assignTheme(r).theme
  themeById[id] = theme

  const type = r.type || "其他"
  typeCount.set(type, (typeCount.get(type) || 0) + 1)
  themeCount.set(theme, (themeCount.get(theme) || 0) + 1)

  const d = r.createdAt ? r.createdAt.slice(0, 10) : null
  if (d) {
    if (!dateFrom || d < dateFrom) dateFrom = d
    if (!dateTo || d > dateTo) dateTo = d
  }
}

const sortCount = (m) =>
  [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

const meta = {
  themeById,
  stats: {
    total: rows.length,
    dateFrom,
    dateTo,
    types: sortCount(typeCount),
    themes: sortCount(themeCount),
  },
}

fs.writeFileSync(OUT, JSON.stringify(meta, null, 2))
console.log(
  `[gen-site-meta] 完成：${rows.length} 篇，主题 ${themeCount.size} 个，类型 ${typeCount.size} 种 → ${OUT}`,
)
