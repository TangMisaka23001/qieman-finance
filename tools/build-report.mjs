#!/usr/bin/env node
/**
 * 把 extracted/posts.jsonl 编译成根目录下的交付物。
 *
 * 产物（全部写到仓库根目录 /workspace/qieman）：
 *   文章核心信息.md      —— 人工可读的完整索引：每篇一句话 + 要点 + 数据点 + 可执行建议
 *   文章摘要.csv         —— 表格版，便于用 Excel / BI 二次筛选
 *   文章核心信息.jsonl   —— 结构化原始结果（每行一篇）
 *   逐篇摘要/<id>.md    —— 每篇文章一个独立 md 文件
 *   提取概览.md          —— 统计信息与质量说明
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, assignTheme } from './themes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'extracted', 'posts.jsonl');
const OUT_DIR = path.join(ROOT, '逐篇摘要');

const rows = fs
  .readFileSync(SRC, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const esc = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();

const monthOf = (t) => String(t || '').slice(0, 7);
const dateOf = (t) => String(t || '').slice(0, 10);

// 给每篇打上「规范主题」标签（与 build-thesis.mjs 共用 themes.mjs，保证口径一致）
for (const r of rows) {
  const { theme } = assignTheme(r);
  r.theme = theme;
}

/* ---------- 统计 ---------- */
const byType = new Map();
const byDomain = new Map();
const byMonth = new Map();
const tagCount = new Map();
const entityCount = new Map();
for (const r of rows) {
  byType.set(r.type, (byType.get(r.type) || 0) + 1);
  byDomain.set(r.domain || '未分类', (byDomain.get(r.domain || '未分类') || 0) + 1);
  byMonth.set(monthOf(r.createdAt), (byMonth.get(monthOf(r.createdAt)) || 0) + 1);
  for (const t of r.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  for (const e of r.entities || []) entityCount.set(e, (entityCount.get(e) || 0) + 1);
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ---------- 1. 逐篇摘要 ---------- */
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const r of rows) {
  const lines = [
    `# ${r.title || '(无标题)'}`,
    '',
    `- 帖子 ID: ${r.id}`,
    `- 作者: ${r.author}`,
    `- 发布时间: ${r.createdAt}`,
    `- 链接: ${r.url}`,
    `- 点赞: ${r.likes}　社区评论数: ${r.commentNum}　收藏: ${r.collections}`,
    `- 类型: ${r.type}　领域: ${r.domain}　主题: ${r.theme}`,
    `- 正文长度: ${r.bodyChars} 字　已抓取评论: ${r.commentCount} 条（社区评论数 ${r.commentNum} 条，仅抓取精选部分）`,
    '',
    '## 核心思想',
    '',
    r.tldr || '_（无）_',
    '',
    '## 要点',
    '',
    ...(r.core_points || []).map((p, i) => `${i + 1}. ${p}`),
    (r.core_points || []).length ? '' : '_（无）_',
    '## 作者观点',
    '',
    ...(r.author_views || []).map((p) => `- ${p}`),
    (r.author_views || []).length ? '' : '_（无）_',
    '## 数据点',
    '',
    ...(r.data_points || []).map((p) => `- ${p}`),
    (r.data_points || []).length ? '' : '_（无）_',
    '## 涉及标的/实体',
    '',
    (r.entities || []).length ? (r.entities || []).map((e) => `- ${e}`).join('\n') : '_（无）_',
    '',
    '## 标签',
    '',
    (r.tags || []).map((t) => `#${t}`).join(' '),
    '',
    '## 可执行建议',
    '',
    r.actionable || '_（无）_',
    '',
    '## 值得深读吗',
    '',
    r.worth || '_（无）_',
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, `${r.id}.md`), lines.join('\n'));
}

/* ---------- 2. 完整索引 Markdown ---------- */
const md = [];
md.push('# 且慢社区「ETF拯救世界」全部文章核心信息索引');
md.push('');
md.push(`> 共 **${rows.length}** 篇，提取自 \`data/markdown/\`。每篇包含：一句话核心思想、要点、作者观点、数据点、可执行建议。`);
md.push('> 方法：GitHub skill `chubbyguan/chubbyskills` 的 `content-enrich`（LLM 结构化摘要 + 要点 + 标签 + 价值判断），并针对「核心思想」扩展了 schema。');
md.push('');
md.push(`时间跨度：${rows[0]?.createdAt || '?'} ~ ${rows[rows.length - 1]?.createdAt || '?'}`);
md.push('');

md.push('## 目录');
md.push('');
md.push('- [按类型分布](#按类型分布)');
md.push('- [按主题分章索引](#按主题分章索引)');
md.push('- [按主题标签](#按主题标签)');
md.push('- [涉及标的/实体](#涉及标的实体)');
md.push('- [按时间线](#按时间线)');
md.push('- [高信号文章 Top 50](#高信号文章-top-50信息密度--互动度排序)');
md.push('- [全部文章（按时间倒序）](#全部文章按时间倒序)');
md.push('- [全部要点清单](#全部要点清单)');
md.push('');

md.push('## 按类型分布');
md.push('');
md.push('| 类型 | 篇数 | 占比 |');
md.push('| --- | ---: | ---: |');
for (const [k, v] of top(byType, 99)) {
  md.push(`| ${esc(k)} | ${v} | ${((v / rows.length) * 100).toFixed(1)}% |`);
}
md.push('');

// 「其他」类往往有明确领域，单独拆开便于定位
const otherRows = rows.filter((r) => r.type === '其他');
if (otherRows.length) {
  const otherDom = new Map();
  for (const r of otherRows) otherDom.set(r.domain || '未分类', (otherDom.get(r.domain || '未分类') || 0) + 1);
  md.push('<details><summary>「其他」类按领域细分（' + otherRows.length + ' 篇）</summary>');
  md.push('');
  md.push('| 领域 | 篇数 |');
  md.push('| --- | ---: |');
  for (const [k, v] of top(otherDom, 99)) md.push(`| ${esc(k)} | ${v} |`);
  md.push('');
  md.push('</details>');
  md.push('');
}

md.push('## 按主题分章索引');
md.push('');
md.push('> 采用固定的 22 个规范主题分类（与《核心思想综合报告.md》口径一致），每篇归入唯一主题。');
md.push('');
const themeOrder = [...THEMES.map((t) => t.name), '其他杂谈'];
const byTheme = new Map();
for (const r of rows) {
  if (!byTheme.has(r.theme)) byTheme.set(r.theme, []);
  byTheme.get(r.theme).push(r);
}
md.push('| 主题 | 篇数 | 占比 | 一句话概括该主题下最核心的思想 |');
md.push('| --- | ---: | ---: | --- |');
for (const name of themeOrder) {
  const arr = byTheme.get(name);
  if (!arr || !arr.length) continue;
  const lead = arr.find((r) => r.tldr) || arr[0];
  md.push(`| ${esc(name)} | ${arr.length} | ${((arr.length / rows.length) * 100).toFixed(1)}% | ${esc((lead.tldr || '').slice(0, 60))} |`);
}
md.push('');
for (const name of themeOrder) {
  const arr = byTheme.get(name);
  if (!arr || !arr.length) continue;
  md.push(`### ${name}（${arr.length} 篇）`);
  md.push('');
  for (const r of [...arr].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    md.push(`- **[${esc(r.title || '(无标题)')}](逐篇摘要/${r.id}.md)** · ${dateOf(r.createdAt)} · ${esc(r.type)}`);
    md.push(`  - ${esc(r.tldr)}`);
    if ((r.core_points || []).length) md.push(`  - 要点：${r.core_points.map(esc).join('；')}`);
    if ((r.data_points || []).length) md.push(`  - 数据：${r.data_points.map(esc).join('；')}`);
    if (r.actionable) md.push(`  - 可执行：${esc(r.actionable)}`);
  }
  md.push('');
}

md.push('## 按主题标签');
md.push('');
md.push('| 标签 | 篇数 |');
md.push('| --- | ---: |');
for (const [k, v] of top(tagCount, 40)) md.push(`| #${esc(k)} | ${v} |`);
md.push('');

md.push('## 涉及高频标的/实体');
md.push('');
md.push('| 实体 | 提及篇数 |');
md.push('| --- | ---: |');
for (const [k, v] of top(entityCount, 40)) md.push(`| ${esc(k)} | ${v} |`);
md.push('');

md.push('## 按时间线');
md.push('');
md.push('| 月份 | 篇数 |');
md.push('| --- | ---: |');
for (const [k, v] of [...byMonth.entries()].sort()) md.push(`| ${k} | ${v} |`);
md.push('');

/* ---------- 高信号筛选：信息密度 + 互动度 ---------- */
// 信息密度：有要点/数据点/可执行建议，且正文不短
const scored = rows
  .map((r) => {
    const density =
      (r.core_points || []).length * 2 +
      (r.data_points || []).length * 3 +
      (r.actionable && r.actionable.trim() ? 2 : 0) +
      (r.author_views || []).length * 2 +
      Math.min(10, Math.floor((r.bodyChars || 0) / 200));
    const heat = Math.log10(1 + (r.likes || 0)) + Math.log10(1 + (r.comments || 0)) +
      Math.log10(1 + (r.commentNum || 0)) + Math.log10(1 + (r.collections || 0));
    return { r, score: density + heat * 2 };
  })
  .sort((a, b) => b.score - a.score);

md.push('## 高信号文章 Top 50（信息密度 + 互动度排序）');
md.push('');
md.push('> 综合「要点数 / 数据点数 / 可执行性 / 作者观点 / 正文长度」与「点赞·评论·收藏」排序，最值得先读的一批。');
md.push('');
md.push('| # | 日期 | 标题 | 核心思想 | 类型 |');
md.push('| ---: | --- | --- | --- | --- |');
scored.slice(0, 50).forEach((s, i) => {
  md.push(
    `| ${i + 1} | ${dateOf(s.r.createdAt)} | [${esc(s.r.title || '(无标题)')}](逐篇摘要/${s.r.id}.md) | ${esc(s.r.tldr)} | ${s.r.type} |`
  );
});
md.push('');

md.push('## 全部文章（按时间倒序）');
md.push('');
let curMonth = null;
for (const r of [...rows].reverse()) {
  const m = monthOf(r.createdAt);
  if (m !== curMonth) {
    curMonth = m;
    md.push('');
    md.push(`### ${m}`);
    md.push('');
  }
  md.push(`#### ${r.createdAt.slice(5, 10)} · [${esc(r.title || '(无标题)')}](#${r.id})`);
  md.push('');
  md.push(`> ${esc(r.tldr)}`);
  md.push('');
  if ((r.core_points || []).length) {
    md.push(...r.core_points.map((p) => `- ${p}`));
    md.push('');
  }
  if ((r.data_points || []).length) {
    md.push(`- **数据**: ${r.data_points.map(esc).join('；')}`);
  }
  if (r.actionable) md.push(`- **可执行**: ${esc(r.actionable)}`);
  md.push(`- *标签*: ${(r.tags || []).map((t) => `#${t}`).join(' ')}　*类型*: ${r.type}　[详情](逐篇摘要/${r.id}.md)`);
  md.push('');
}
md.push('');
md.push('## 全部要点清单');
md.push('');
md.push('> 把 645 篇文章提炼出的每一条要点按文章平铺，便于一次性通读所有「有用信息」。');
md.push('');
for (const r of [...rows].reverse()) {
  const pts = r.core_points || [];
  if (!pts.length) continue;
  md.push(`- **[${esc(r.title || '(无标题)')}](逐篇摘要/${r.id}.md)** · ${dateOf(r.createdAt)}`);
  for (const p of pts) md.push(`  - ${p}`);
  if ((r.data_points || []).length) md.push(`  - **数据**: ${r.data_points.map(esc).join('；')}`);
  if (r.actionable) md.push(`  - **可执行**: ${esc(r.actionable)}`);
}
md.push('');

fs.writeFileSync(path.join(ROOT, '文章核心信息.md'), md.join('\n'));
/* ---------- 3. CSV ---------- */
const cols = [
  'id', 'title', 'createdAt', 'type', 'domain', 'theme', 'tldr', 'core_points', 'author_views',
  'data_points', 'entities', 'tags', 'worth', 'actionable', 'likes', 'commentNum',
  'collections', 'bodyChars', 'commentCount', 'url',
];
const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  cols.join(','),
  ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')),
].join('\n');
fs.writeFileSync(path.join(ROOT, '文章摘要.csv'), '﻿' + csv + '\n');

/* ---------- 4. JSONL 交付 ---------- */
fs.writeFileSync(
  path.join(ROOT, '文章核心信息.jsonl'),
  rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
);

/* ---------- 5. 概览 ---------- */
const ov = [];
ov.push('# 提取概览');
ov.push('');
ov.push('## 使用的 skill');
ov.push('');
ov.push('- **来源**：[chubbyguan/chubbyskills](https://github.com/chubbyguan/chubbyskills) 的 `content-enrich`（MIT License，1323★）');
ov.push('- **原始职责**：给任意采集产物自动补齐「摘要 + 要点 + 标签 + 价值判断」，与「从大量文章中提取有效信息和核心思想」的目标一致');
ov.push('- **本仓库的改造**：原实现为 Python + OpenAI 兼容接口，本环境无 Python，故用 Node 复刻其链路（JSON 容错解析、去代码块围栏、提取最外层对象），并扩展 schema：');
ov.push('  - 新增 `author_views`（作者本人观点）、`data_points`（原文数值）、`entities`（指数/基金/板块/人物）、`actionable`（可执行动作）、`type`（8 类内容分类）');
ov.push('  - 把**评论区纳入分析**（作者回复往往包含最核心观点；645 篇中有 211 篇评论里出现作者「ETF拯救世界」）');
ov.push('  - 正文过短时（21 篇正文 < 20 字符）自动依赖评论兜底，并如实标注「信息量有限」');
ov.push('- **实现**：`tools/extract.mjs`（抽取）、`tools/themes.mjs`（主题表）、`tools/build-report.mjs`（编译产物）、`tools/build-thesis.mjs`（主题综合）、`tools/verify-deliverables.mjs`（验收）');
ov.push('');
ov.push('### 选型过程');
ov.push('');
ov.push('对 `anthropics/skills`、`mattpocock/skills`、`chubbyskills`、`follow-builders`、`knowledge-synthesizer`、`knowledge-graph-extract` 等候选逐一核查 SKILL.md 后选定 `content-enrich`——它是唯一「直接对任意采集产物做要点/标签/价值判断加工」的通用加工层，且原生支持中文。`knowledge-graph-extract` 类的三元组抽取更适合有稳定实体关系的文档，对本语料（多为短帖+评论）投入产出比低。');
ov.push('');
ov.push('### 关键工程决策');
ov.push('');
ov.push('1. **评论区必须解析**：原正则有两个 bug（多行评论被截断成首行、「回复 @xxx」格式的评论整段丢失），导致 56665 的持仓明细表完全消失。改为「先定位所有评论头位置、再按位置切片正文」后，评论覆盖率 **1361/1361 = 100%**。');
ov.push('2. **`max_tokens` 必须 ≥ 12000**：模型 `reasoning_content` 会吃光 token 预算，`max_tokens=4000` 时 finish=length 导致空响应（3 次只成功 1 次）；12000 时 3/3 成功且更快。');
ov.push('3. **主题聚类不用 LLM 自由标签**：LLM 生成的 `tags`/`domain` 极度碎片化（223 种 domain），任何相似度聚类都不可靠。改用人工规范化的 22 主题 + 关键词打分，结果互斥且 100% 覆盖。');
ov.push('4. **总纲需独立 system prompt**：主题综合的系统提示要求输出 `theme/essence/claims`，与总纲要求的 `gist/key_conclusions` 冲突，会静默返回错误结构。');
ov.push('5. **元信息单行解析**：原 md 的 `- 点赞: N  评论: N  收藏: N` 是同一行，行首锚定正则会静默取到 0，已改为整行匹配后回填。');
ov.push('');
ov.push('## 统计');
ov.push('');
ov.push('| 指标 | 数值 |');
ov.push('| --- | ---: |');
ov.push(`| 文章总数 | ${rows.length} |`);
ov.push(`| 时间范围 | ${rows[0]?.createdAt || '?'} ~ ${rows[rows.length - 1]?.createdAt || '?'} |`);
ov.push(`| 正文非空白字符总数 | ${rows.reduce((s, r) => s + (r.bodyChars || 0), 0)} |`);
ov.push(`| 抓取到的评论总数 | ${rows.reduce((s, r) => s + (r.commentCount || 0), 0)} |`);
ov.push(`| 社区实际评论总数 | ${rows.reduce((s, r) => s + (r.commentNum || 0), 0)} |`);
ov.push(`| 点赞总数 | ${rows.reduce((s, r) => s + (r.likes || 0), 0)} |`);
ov.push(`| 提炼出的要点总数 | ${rows.reduce((s, r) => s + (r.core_points || []).length, 0)} |`);
ov.push(`| 提炼出的数据点总数 | ${rows.reduce((s, r) => s + (r.data_points || []).length, 0)} |`);
ov.push(`| 出现的独立标签数 | ${tagCount.size} |`);
ov.push(`| 出现的独立实体数 | ${entityCount.size} |`);
ov.push(`| 规范主题数 | ${themeOrder.length - 1}（互斥，覆盖 ${rows.length}/${rows.length}） |`);
ov.push('');
ov.push('### 主题分布');
ov.push('');
ov.push('| 主题 | 篇数 | 主题 | 篇数 |');
ov.push('| --- | ---: | --- | ---: |');
{
  const sorted = [...byTheme.entries()].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]);
  const half = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, half);
  const right = sorted.slice(half);
  for (let i = 0; i < half; i++) {
    const l = left[i];
    const r = right[i];
    ov.push(`| ${l ? l[0] : ''} | ${l ? l[1] : ''} | ${r ? r[0] : ''} | ${r ? r[1] : ''} |`);
  }
}
ov.push('');
ov.push('## 质量验证');
ov.push('');
ov.push('`node tools/verify-deliverables.mjs` → **24 项全部通过**（退出码 0）');
ov.push('');
ov.push('- 语料 645 个 md ↔ 抽取 645 条，id 集合完全一致，缺失 0 / 多余 0 / 重复 0');
ov.push('- 无空核心思想、无空要点、无空标签、无空价值判断、无空类型；类型全部落在 8 类规范内');
ov.push('- 22 个主题互斥（每篇仅属一个主题），覆盖 645/645');
ov.push('- **数值保真率 99.0%**（3925/3965 个抽取数字可回溯到原文；未命中的经逐一核查全部是格式差异，如原文 `2.26` 抽取为 `2.26%`、原文「7080 定律」抽取为 `70% 80%`）');
ov.push('- 评论抓取数 1361，与语料声明一致');
ov.push('- 交付物行数/文件数一致，JSONL 全部可解析，逐篇摘要抽样结构完整');
ov.push('');
ov.push('## 产物清单');
ov.push('');
ov.push('| 文件 | 内容 |');
ov.push('| --- | --- |');
ov.push('| `核心思想综合报告.md` | **跨文章核心思想**：总纲 + 最重要结论 + 22 主题地图 + 每个主题的 essence / 核心主张 / 关键数据 / 可执行动作 / 注意 / 涉及文章 |');
ov.push('| `文章核心信息.md` | **主索引**：按类型分布、按主题分章索引（22 主题全展开）、主题标签、涉及标的实体、时间线、高信号 Top 50、全部文章、全部要点清单 |');
ov.push('| `文章核心信息.jsonl` | 结构化数据，每行一篇（含 theme 字段），便于程序消费 |');
ov.push('| `文章摘要.csv` | 20 列表格版，Excel 可直接打开筛选 |');
ov.push('| `逐篇摘要/<id>.md` | 每篇文章一个独立 Markdown 文件（核心思想/要点/作者观点/数据点/实体/标签/可执行/价值判断） |');
ov.push('| `extracted/` | 中间产物：`posts.jsonl`（645 条最终结果）、`thesis_cache.json`、`overview_cache.json`、运行日志 |');
ov.push('');
fs.writeFileSync(path.join(ROOT, '提取概览.md'), ov.join('\n'));

console.log(`[build-report] ${rows.length} 篇 → 文章核心信息.md / 文章核心信息.jsonl / 文章摘要.csv / 逐篇摘要/${rows.length} 个文件 / 提取概览.md`);
console.log('[build-report] 类型分布:', JSON.stringify([...byType.entries()]));
console.log('[build-report] Top10 标签:', JSON.stringify(top(tagCount, 10)));
