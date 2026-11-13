#!/usr/bin/env node
/**
 * 跨文章「核心思想综合」——把 645 篇的逐篇抽取结果，按主题聚类后做二级综合。
 *
 * 思路（借鉴 chubbyskills 的知识库思路 + 知识图谱的主题聚合）：
 *   1. 用标签/领域/实体做贪心聚类，形成语义主题簇
 *   2. 每个主题簇把该簇所有文章的 tldr + 要点喂给 LLM，生成「这一主题下的核心思想」小节
 *   3. 汇总成一份可通读的综合报告：核心思想地图 + 各主题深度结论 + 可执行清单
 *
 * 产物：根目录 核心思想综合报告.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, assignTheme } from './themes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'extracted', 'posts.jsonl');
const OUT = path.join(ROOT, '核心思想综合报告.md');
const CACHE = path.join(ROOT, 'extracted', 'thesis_cache.json');
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * API Key 惰性读取：命中缓存时根本不会调用 LLM，此时不该强制要求凭据。
 * （否则在只做缓存重放的环境里会在模块加载阶段就抛错。）
 */
let cachedKey = null;
function apiKey() {
  if (cachedKey) return cachedKey;
  if (process.env.LLM_API_KEY) { cachedKey = process.env.LLM_API_KEY; return cachedKey; }
  const credFile = process.env.LLM_API_KEY_CRED_FILE;
  if (credFile && fs.existsSync(credFile)) {
    const m = fs.readFileSync(credFile, 'utf8').match(/NEWAPI_API_KEY:\s*(\S+)/);
    if (m) { cachedKey = m[1]; return cachedKey; }
  }
  throw new Error('找不到 LLM API Key。请设置环境变量 LLM_API_KEY（可选 LLM_BASE_URL / LLM_MODEL）。');
}

const rows = fs.readFileSync(SRC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const DRY = process.argv.includes('--dry-run');

/* ---------------------------------------------------------------- *
 * 1. 主题聚类：规则式「规范主题表」（见 tools/themes.mjs）
 *    固定主题 + 关键词打分，保证每篇文章只归入一个主题且 645/645 全覆盖。
 * ---------------------------------------------------------------- */
const clusters = THEMES.map((t) => ({ seed: t.name, theme: t, tags: new Set(), entities: new Set(), domains: new Set(), posts: [] }));
const assigned = new Set();
for (const r of rows) {
  const { theme, themeIndex } = assignTheme(r);
  if (themeIndex < 0) continue; // 未命中任何关键词 → 进「其他杂谈」
  const c = clusters[themeIndex];
  c.posts.push(r);
  for (const t of r.tags || []) c.tags.add(t);
  for (const e of r.entities || []) c.entities.add(e);
  if (r.domain) c.domains.add(r.domain);
  assigned.add(r.id);
}

// 未命中的文章 → 兜底簇
const loose = rows.filter((r) => !assigned.has(r.id));
if (loose.length) {
  clusters.push({
    seed: '其他杂谈',
    theme: { name: '其他杂谈' },
    tags: new Set(loose.flatMap((r) => r.tags || []).slice(0, 30)),
    entities: new Set(),
    domains: new Set(loose.map((r) => r.domain).filter(Boolean)),
    posts: loose,
  });
}

// 丢掉过小的簇（少于 2 篇的不做综合）
const keptClusters = clusters.filter((c) => c.posts.length >= 2);
clusters.length = 0;
clusters.push(...keptClusters);
console.error(`[thesis] 聚类完成：${clusters.length} 个主题，覆盖 ${clusters.reduce((s, c) => s + c.posts.length, 0)}/${rows.length} 篇`);
if (DRY) {
  console.error('[thesis] dry-run：主题分布');
  for (const c of clusters) {
    console.error(`  ${String(c.posts.length).padStart(3)} 篇  ${c.seed}  [${[...c.tags].slice(0, 6).join(',')}]`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- *
 * 2. LLM 综合每个主题簇
 * ---------------------------------------------------------------- */
const SYSTEM = `你是投资研究总监，正在把一批投资社区文章提炼成一份可通读的主题综述。
输入是同一主题下的多篇文章摘要（每篇含一句话核心思想与要点）。
请提炼这个主题下**跨文章的核心思想**，不要逐篇罗列。

只输出一个 JSON 对象：
{
  "theme": "主题名（≤12字）",
  "essence": "这个主题的核心思想，3-5句，讲清作者们的共同主张/方法论/结论",
  "claims": ["跨文章提炼出的重要主张或洞察，4-8条，每条≤45字"],
  "data": ["跨文章出现的关键数据，0-5条，保留原数值"],
  "actions": ["读者可执行的动作，2-4条，具体可操作"],
  "notes": "值得注意的争议、分歧或局限，1-2句；没有就写空字符串"
}

要求：只用输入里真实出现的信息，不要外部知识，不要编造数字。`;

function parseJson(raw) {
  raw = (raw || '').trim();
  const f = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (f) raw = f[1];
  try { return JSON.parse(raw); } catch {}
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(raw.slice(s, e + 1));
  throw new Error('bad json');
}

async function llm(promptText, sysPrompt = SYSTEM) {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: promptText },
          ],
          temperature: 0.3,
          // 与 extract.mjs 保持一致：4000 会被 reasoning 吃光导致 finish=length 空响应
          max_tokens: 12000,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(240000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const msg = j?.choices?.[0]?.message ?? {};
      const c = typeof msg.content === 'string' ? msg.content : '';
      if (!c.trim()) {
        const r = msg.reasoning_content || '';
        const m = r.match(/\{[\s\S]*\}/);
        if (m) return parseJson(m[0]);
        throw new Error(`empty content (finish=${j?.choices?.[0]?.finish_reason})`);
      }
      return parseJson(c);
    } catch (e) {
      if (a === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, a) + Math.random() * 800));
    }
  }
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
// 总纲单独缓存：失败重跑时不必重算 22 个主题
const OVERVIEW_CACHE = path.join(ROOT, 'extracted', 'overview_cache.json');
const overviewCache = fs.existsSync(OVERVIEW_CACHE)
  ? JSON.parse(fs.readFileSync(OVERVIEW_CACHE, 'utf8'))
  : {};
const total = clusters.filter((x) => x.posts.length >= 2).length;
let done = 0;

const synthesize = async (c) => {
  const ck = c.seed;
  if (cache[ck]) { c.synthesis = cache[ck]; return; }
  // 簇过大时按时间切块分别综合，再做一次合并综合
  const CHUNK = 60;
  const chunks = [];
  for (let i = 0; i < c.posts.length; i += CHUNK) chunks.push(c.posts.slice(i, i + CHUNK));
  const toMaterial = (arr) =>
    arr
      .map((p, i) => `【${i + 1}】${p.title}\n核心：${p.tldr}\n要点：${(p.core_points || []).join('；')}${p.data_points?.length ? `\n数据：${p.data_points.join('；')}` : ''}`)
      .join('\n\n');
  try {
    if (chunks.length === 1) {
      const prompt = `以下是「${c.seed}」主题下的 ${c.posts.length} 篇文章摘要：\n\n${toMaterial(c.posts)}\n\n请做主题级综合。`;
      c.synthesis = await llm(prompt);
    } else {
      const parts = [];
      for (let i = 0; i < chunks.length; i++) {
        const prompt = `以下是「${c.seed}」主题下的文章摘要（第 ${i + 1}/${chunks.length} 部分，共 ${chunks[i].length} 篇）：\n\n${toMaterial(chunks[i])}\n\n请做这部分的主题级综合。`;
        parts.push(await llm(prompt));
      }
      const mergeInput = parts
        .map((p, i) => `### 部分${i + 1}\n${p.essence}\n${(p.claims || []).map((x) => '- ' + x).join('\n')}`)
        .join('\n\n');
      c.synthesis = await llm(
        `以下是同一主题「${c.seed}」在 ${parts.length} 个部分上的综合结果：\n\n${mergeInput}\n\n请合并为一个统一的、带跨部分洞察的主题综合（claims 要去重并提炼共性）。`
      );
    }
    cache[ck] = c.synthesis;
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error(`  ⚠️ 主题 ${ck} 综合失败: ${e.message}`);
    c.synthesis = null;
  }
  done++;
  console.error(`[thesis] ✅ ${done}/${total} 主题: ${ck} (${c.posts.length} 篇)`);
};

// 并发综合（网关可承受 6 路并发），加速 22 个主题的生成
const CONC = 6;
const todo = clusters.filter((c) => c.posts.length >= 2);
const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(CONC, queue.length) }, async () => {
    while (queue.length) {
      const c = queue.shift();
      await synthesize(c);
    }
  })
);

/* ---------------------------------------------------------------- *
 * 3. 输出综合报告
 * ---------------------------------------------------------------- */
const out = [];
out.push('# 核心思想综合报告');
out.push('');
out.push(`> 基于 **${rows.length}** 篇且慢社区「ETF拯救世界」文章，跨文章主题级综合。`);
out.push('> 抽取方法见 [提取概览.md](提取概览.md)，逐篇明细见 [文章核心信息.md](文章核心信息.md)。');
out.push('');

/* 全局：让 LLM 写一份总纲 */
const overviewInput = clusters
  .filter((c) => c.synthesis)
  .map((c) => `### ${c.synthesis.theme}\n${c.synthesis.essence}\n${(c.synthesis.claims || []).map((x) => '- ' + x).join('\n')}`)
  .join('\n\n');

let overview = null;
try {
  // 单独的系统提示：主题综合的 SYSTEM 要求输出 theme/essence/claims，
  // 与总纲要求的 gist/key_conclusions 冲突，会导致返回结构不符。
  const OVERVIEW_SYSTEM =
    '你是投资研究总监，正在为一整批投资社区文章写总纲。请把各主题综合归纳成整体主线。';
  if (overviewCache.gist) {
    overview = overviewCache;
  } else {
    overview = await llm(
      `以下是若干主题级综合结果：\n\n${overviewInput}\n\n请写一份**总纲**：用 4-8 句话概括这批文章整体的核心思想主线（作者的方法论、关键主张、当前阶段的任务），并给出 3-6 条「最重要的一句话结论」。\n\n只输出 JSON：{"gist": "总纲文字", "key_conclusions": ["结论1", "结论2", "结论3"]}`,
      OVERVIEW_SYSTEM
    );
    if (!overview?.gist) throw new Error('返回结构缺少 gist 字段：' + JSON.stringify(Object.keys(overview || {})));
    fs.writeFileSync(OVERVIEW_CACHE, JSON.stringify(overview, null, 2));
  }
} catch (e) {
  console.error('  ⚠️ 总纲失败:', e.message);
}

out.push('## 总纲');
out.push('');
if (overview?.gist) out.push(overview.gist);
else out.push('_总纲生成失败，见各主题小节。_');
out.push('');
if (overview?.key_conclusions?.length) {
  out.push('### 最重要的结论');
  out.push('');
  for (const k of overview.key_conclusions) out.push(`- ${k}`);
  out.push('');
}

out.push('## 主题地图');
out.push('');
out.push('| 主题 | 文章数 | 标签 | 领域 |');
out.push('| --- | ---: | --- | --- |');
for (const c of clusters.filter((x) => x.posts.length >= 2).sort((a, b) => b.posts.length - a.posts.length)) {
  out.push(
    `| ${c.synthesis?.theme || c.seed} | ${c.posts.length} | ${[...c.tags].slice(0, 5).map((t) => `#${t}`).join(' ')} | ${[...c.domains].join('、')} |`
  );
}
out.push('');

let n = 0;
for (const c of clusters.filter((x) => x.posts.length >= 2).sort((a, b) => b.posts.length - a.posts.length)) {
  n++;
  const s = c.synthesis;
  out.push(`## ${n}. ${s?.theme || c.seed}`);
  out.push('');
  out.push(`> 覆盖 ${c.posts.length} 篇　标签：${[...c.tags].slice(0, 8).map((t) => `#${t}`).join(' ')}`);
  out.push('');
  if (s?.essence) { out.push(s.essence); out.push(''); }
  if (s?.claims?.length) {
    out.push('**核心主张**');
    out.push('');
    for (const x of s.claims) out.push(`- ${x}`);
    out.push('');
  }
  if (s?.data?.length) {
    out.push('**关键数据**');
    out.push('');
    for (const x of s.data) out.push(`- ${x}`);
    out.push('');
  }
  if (s?.actions?.length) {
    out.push('**可执行动作**');
    out.push('');
    for (const x of s.actions) out.push(`- ${x}`);
    out.push('');
  }
  if (s?.notes) {
    out.push(`**注意**：${s.notes}`);
    out.push('');
  }
  out.push(`<details><summary>涉及文章（${c.posts.length}）</summary>`);
  out.push('');
  for (const p of c.posts) {
    out.push(`- [${p.title || '(无标题)'}](逐篇摘要/${p.id}.md) — ${p.tldr}`);
  }
  out.push('');
  out.push('</details>');
  out.push('');
}

fs.writeFileSync(OUT, out.join('\n'));
console.log(`[thesis] ✅ 已生成 ${OUT}（${clusters.filter((c) => c.posts.length >= 2).length} 个主题）`);
