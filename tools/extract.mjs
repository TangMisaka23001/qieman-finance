#!/usr/bin/env node
/**
 * 批量文章信息抽取器 —— 移植并扩展 chubbyguan/chubbyskills 的 `content-enrich` skill。
 *
 * 来源 skill: https://github.com/chubbyguan/chubbyskills  (MIT, 1323★)
 *   - content-enrich/SKILL.md: 给任意采集产物补「摘要 + 要点 + 标签 + 价值判断」
 *   - content-enrich/scripts/enrich.py: 原实现（Python，仅标准库 + OpenAI 兼容接口）
 *   - chubby_common/llm.py: LLM JSON 容错解析（去代码块包裹、提取最外层对象）
 *
 * 本仓库环境无 Python，因此用 Node 复刻其核心链路，并针对「从大量文章中提取
 * 有效信息和核心思想」这一目标扩展了抽取 schema（增加核心思想、作者观点、数据点、
 * 可执行建议、实体等字段），同时把评论区纳入分析（作者回复往往包含最核心的观点）。
 *
 * 特性：
 *   - 幂等 / 可断点续跑：结果按 post id 落盘为 JSONL，重跑只补缺失项
 *   - 并发可控：默认 8 路并发，失败自动重试（指数退避）
 *   - JSON 容错：模型偶尔会裹 markdown 代码块或加前后废话，全部兜住
 *
 * 用法:
 *   node tools/extract.mjs                  # 抽取全部
 *   node tools/extract.mjs --limit 20       # 只抽前 20 篇（调试）
 *   node tools/extract.mjs --concurrency 16
 *   node tools/extract.mjs --model MiniMax-M3.1-Flash
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MD_DIR = path.join(ROOT, 'data', 'markdown');
const OUT_DIR = path.join(ROOT, 'extracted');
const OUT_JSONL = path.join(OUT_DIR, 'posts.jsonl');
const OUT_RAW = path.join(OUT_DIR, 'raw');

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */
const CRED_FILE = process.env.LLM_API_KEY_CRED_FILE || '';
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
/** 主模型失败时的降级链（网关偶发空响应，换模型通常能解决） */
const FALLBACK_MODELS = (process.env.LLM_FALLBACK_MODELS || 'gpt-4o-mini,claude-3-5-haiku-20241022')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function readApiKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  if (CRED_FILE && fs.existsSync(CRED_FILE)) {
    const raw = fs.readFileSync(CRED_FILE, 'utf8');
    const m = raw.match(/NEWAPI_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  throw new Error('找不到 LLM API Key。请设置环境变量 LLM_API_KEY（可选 LLM_BASE_URL / LLM_MODEL）。');
}

function parseArgs(argv) {
  const out = { limit: Infinity, concurrency: 8, model: process.env.LLM_MODEL || 'gpt-4o-mini', force: false, ids: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--force') out.force = true;
    else if (a === '--ids') out.ids = new Set(argv[++i].split(',').map((s) => s.trim()));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 解析 markdown
 * ------------------------------------------------------------------ */
const RE_FIELD = (name) => new RegExp(`^- ${name}:\\s*(.*)$`, 'm');
// 点赞/评论/收藏 三个字段在原 md 里是同一行：`- 点赞: 1177  评论: 799  收藏: 152`
// 单独用行首锚定的 RE_FIELD('评论') 匹配不到（它不在行首），会静默得到 0。
const RE_SOCIAL = /^- 点赞:\s*(\d+)\s+评论:\s*(\d+)\s+收藏:\s*(\d+)/m;
const social = head.match(RE_SOCIAL);

/** 把一篇 markdown 拆成 { meta, body, comments[] } */
export function parsePost(md) {
  const iBody = md.indexOf('## 正文');
  const iCom = md.indexOf('## 评论');
  const head = md.slice(0, iBody >= 0 ? iBody : md.length);
  const body = iBody >= 0 ? md.slice(iBody + 5, iCom >= 0 ? iCom : md.length) : '';
  const commentBlock = iCom >= 0 ? md.slice(iCom) : '';

  const title = (md.match(/^#\s+(.*)$/m) || [, '(无标题)'])[1].trim();
  const meta = {
    id: (head.match(RE_FIELD('帖子 ID')) || [, ''])[1].trim(),
    author: (head.match(RE_FIELD('作者')) || [, ''])[1].trim(),
    createdAt: (head.match(RE_FIELD('发布时间')) || [, ''])[1].trim(),
    likes: Number(social?.[1] ?? (head.match(RE_FIELD('点赞')) || [, '0'])[1].match(/\d+/)?.[0] ?? 0),
    commentNum: Number(social?.[2] ?? 0),
    collections: Number(social?.[3] ?? 0),
    url: (head.match(RE_FIELD('链接')) || [, ''])[1].trim(),
    legacy: /- 结构: 旧版/.test(head),
  };

  // 评论解析：先定位所有评论头行，再按头部位置切片正文。
  // 不能用单一正则 + 惰性前瞻 —— 昵称后可能带「回复 @xxx」，前瞻会匹配失败并在空行处提前截断。
  const comments = [];
  const headerRe = /^\*\*([^*\n]+)\*\*([ \t]*(?:回复[ \t]*@[^\n]*?)?)[ \t]*·[ \t]*([^\n·]+)[ \t]*·[ \t]*赞[ \t]*(\d+)[ \t]*$/gm;
  const heads = [];
  let hm;
  while ((hm = headerRe.exec(commentBlock)) !== null) {
    heads.push({
      start: hm.index,
      bodyStart: hm.index + hm[0].length,
      author: hm[1].trim(),
      at: hm[3].trim(),
      likes: Number(hm[4]),
    });
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : commentBlock.length;
    comments.push({
      author: h.author,
      at: h.at,
      likes: h.likes,
      text: commentBlock.slice(h.bodyStart, end).trim(),
    });
  });
  return { title, meta, body: body.trim(), comments };
}

/* ------------------------------------------------------------------ *
 * 送模型的文本构造
 * ------------------------------------------------------------------ */
const AUTHOR = 'ETF拯救世界';

/** 正文里图片占位符太多，先压掉，避免污染摘要 */
function cleanBody(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[图片\]\s*\[图片\]/g, '[图片]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 构造送入模型的文本。评论只取高赞 + 作者回复，避免噪音淹没正文。
 */
export function buildPromptText(post, { maxComments = 12 } = {}) {
  const { meta, body, comments } = post;
  const parts = [];
  parts.push(`【标题】${post.title}`);
  parts.push(`【发布时间】${meta.createdAt}`);

  const b = cleanBody(body);
  parts.push(`【正文】\n${b || '(正文为空)'}`);

  if (comments.length) {
    const picked = [...comments]
      .sort((x, y) => {
        const ax = x.author.includes(AUTHOR) ? 1 : 0;
        const ay = y.author.includes(AUTHOR) ? 1 : 0;
        if (ax !== ay) return ay - ax; // 作者回复优先
        return y.likes - x.likes;
      })
      .slice(0, maxComments);
    const lines = picked.map(
      (c, idx) => `[${idx + 1}] ${c.author}${c.author.includes(AUTHOR) ? '（作者）' : ''}：${c.text.slice(0, 600)}`
    );
    parts.push(
      `【评论区精选（共 ${comments.length} 条，仅摘录 ${picked.length} 条）】\n${lines.join('\n')}`
    );
  }
  return parts.join('\n\n');
}

/* ------------------------------------------------------------------ *
 * 抽取 prompt —— 扩展自 content-enrich 的 SYSTEM_PROMPT
 * ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `你是知识管理助手，服务于中文投资社区（且慢社区）长文摘要工作流。
你的任务：从一篇社区帖子里提取「有效信息和核心思想」，让没读过原文的人也能获得价值。

只输出一个 JSON 对象，不要 markdown 代码块、不要任何多余解释。字段定义：

{
  "tldr": "一句话核心思想，≤50字，讲清这篇到底说了什么/主张什么",
  "core_points": ["要点，3-5条，每条≤40字，是可独立成立的信息点，不是空话"],
  "author_views": ["作者本人在正文或评论中表达的核心观点，0-3条；没有就空数组"],
  "data_points": ["文中（含评论区）出现的具体数据/点位/占比/涨跌幅，0-8条，保留原数值与对应标的"],
  "entities": ["文中提及的指数/基金/板块/公司/人物/宏观概念，0-12个，保留原简称"],
  "domain": "领域，如 指数投资/市场估值/宏观策略/基金研究/社区运营/活动公告",
  "tags": ["3-6个标签，不带#，用于聚合"],
  "worth": "一句话：值不值得深读、对谁有用",
  "actionable": "读者可执行的动作（可复制的操作、可关注的标的/指标）；没有就空字符串",
  "type": "从 投资笔记 / 市场观点 / 研究摘要 / 持仓操作 / 活动公告 / 社区答疑 / 情绪吐槽 / 其他 中选一个"
}

要求：
- 用中文；只提炼原文真实存在的信息，不要外部知识，不要编造数字；
- 如果正文很短而评论有信息量，就从评论里提炼（尤其作者回复）；
- 如果整篇几乎没有信息量（如纯打卡、抽奖通知），tldr 如实写明"信息量有限"，core_points 可只留 1 条；
- **数据点要覆盖评论区**：评论区常含持仓比例、指数点位、涨跌幅、份数等具体数字，
  这些往往是全文最有价值的信息。凡是出现的具体数字（点位、百分比、份数、金额、倍数、比例）都要保留，
  格式如 "中证500：8600-8700 一线大幅减仓"、"红利仓位：8.04%"、"150策略仓位 12.46%"。
  若评论区是持仓明细表，请提炼出「策略名→主要品种及占比」的关键几项，不要整体略过；
- 涉及的具体指数/基金简称（如 150、300、500、S、50、创业板、恒生科技、标普500、纯债、可转债等）请原样保留到 entities；
- JSON 里的字符串不要带换行符。`;

/* ------------------------------------------------------------------ *
 * LLM 调用（OpenAI 兼容接口 + JSON 容错，与 chubby_common/llm.py 对齐）
 * ------------------------------------------------------------------ */
function parseJsonResponse(raw) {
  raw = (raw || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) raw = fenced[1];
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch { /* fallthrough */ }
    }
    throw new Error('模型返回的不是合法 JSON: ' + raw.slice(0, 200));
  }
}

/** 网关偶发返回空 content（reasoning_content 有内容但 content 为空），需显式判失败并重试 */
function extractContent(data) {
  const msg = data?.choices?.[0]?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (content.trim()) return content;
  // 少数网关把 JSON 放进了 reasoning_content
  const reason = typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
  const m = reason.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      JSON.parse(m[0]);
      return m[0];
    } catch { /* ignore */ }
  }
  throw new Error(
    `空响应 (finish=${data?.choices?.[0]?.finish_reason ?? '?'}, reasoning_len=${reason.length})`
  );
}

async function callLLM({ apiKey, model, promptText, temperature = 0.2, retries = 4 }) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `提炼这篇内容：\n\n${promptText}` },
    ],
    temperature,
    // 实测（tools/test-tokens.mjs）：max_tokens=4000 时模型 reasoning_content 会吃光预算导致
    // finish=length + content 为空（3 次里失败 2 次）；12000 则 3/3 成功，且耗时更低。
    max_tokens: 12000,
    response_format: { type: 'json_object' },
  });
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      return parseJsonResponse(extractContent(data));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 800));
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 * 结果规整：模型偶尔字段名漂移 / 类型不对，统一成固定 schema
 * ------------------------------------------------------------------ */
const TYPES = ['投资笔记', '市场观点', '研究摘要', '持仓操作', '活动公告', '社区答疑', '情绪吐槽', '其他'];

function asArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    // 模型有时把数组写成一个带换行的字符串
    return v
      .split(/\n+|(?:\s*\|\s*)|(?:\s*；\s*)/)
      .map((x) => x.replace(/^[-*·\d.、)\s]+/, '').trim())
      .filter(Boolean);
  }
  return [String(v)];
}

function normalize(d) {
  const pick = (...keys) => {
    for (const k of keys) if (d[k] != null) return d[k];
    return undefined;
  };
  let type = String(pick('type', 'category', '类型') || '其他').trim();
  if (!TYPES.includes(type)) {
    // 尝试模糊匹配
    const hit = TYPES.find((t) => type.includes(t) || t.includes(type));
    type = hit || '其他';
  }
  return {
    tldr: String(pick('tldr', 'summary', '核心思想', '一句话总结') || '').trim(),
    core_points: asArray(pick('core_points', 'points', '要点', 'key_points')),
    author_views: asArray(pick('author_views', '作者观点', 'opinions')),
    data_points: asArray(pick('data_points', '数据', 'data')),
    entities: asArray(pick('entities', '实体')),
    domain: String(pick('domain', '领域') || '').trim(),
    tags: asArray(pick('tags', '标签')).map((t) => t.replace(/^#/, '')),
    worth: String(pick('worth', '值得深读', 'value') || '').trim(),
    actionable: String(pick('actionable', 'action', '行动建议') || '').trim(),
    type,
  };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
async function main() {
  const opts = parseArgs(process.argv);
  const apiKey = readApiKey();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OUT_RAW, { recursive: true });

  // 已完成的 id（断点续跑）
  const done = new Map();
  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        done.set(o.id, o);
      } catch { /* 跳过坏行 */ }
    }
  }

  const files = fs
    .readdirSync(MD_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => Number(a.replace('.md', '')) - Number(b.replace('.md', '')));
  const todo = files.filter((f) => {
    const id = f.replace('.md', '');
    if (opts.ids && !opts.ids.has(id)) return false;
    return opts.force || !done.has(id);
  }).slice(0, opts.limit === Infinity ? undefined : opts.limit);

  console.error(`[extract] 模型=${opts.model} 并发=${opts.concurrency} 待处理=${todo.length}/${files.length} 已完成=${done.size}`);
  if (!todo.length) return;

  let ok = 0;
  let fail = 0;
  const failures = [];
  let idx = 0;

  // 增量落盘：每完成 20 篇写一次，避免长任务中断丢失进度
  const flush = () => {
    const all = [...done.values()].sort(
      (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || Number(a.id) - Number(b.id)
    );
    fs.writeFileSync(OUT_JSONL, all.map((o) => JSON.stringify(o)).join('\n') + '\n');
    return all.length;
  };

  const worker = async () => {
    while (idx < todo.length) {
      const f = todo[idx++];
      const id = f.replace('.md', '');
      try {
        const md = fs.readFileSync(path.join(MD_DIR, f), 'utf8');
        const post = parsePost(md);
        const promptText = buildPromptText(post);
        // 主模型失败则依次降级到备用模型，避免单点抖动拖垮整体
        let data = null;
        const chain = [opts.model, ...FALLBACK_MODELS.filter((m) => m !== opts.model)];
        for (const model of chain) {
          try {
            data = await callLLM({ apiKey, model, promptText });
            break;
          } catch (e) {
            if (model === chain[chain.length - 1]) throw e;
            console.error(`[extract]   ↻ ${id} 模型 ${model} 失败(${e.message})，降级到下一个`);
          }
        }
        const rec = normalize(data);
        if (!rec.tldr) throw new Error('模型返回缺少 tldr');

        const record = {
          id,
          title: post.title,
          url: post.meta.url,
          createdAt: post.meta.createdAt,
          author: post.meta.author,
          likes: post.meta.likes,
          commentNum: post.meta.commentNum,
          collections: post.meta.collections,
          legacy: post.meta.legacy,
          bodyChars: post.body.replace(/\s/g, '').length,
          commentCount: post.comments.length,
          ...rec,
        };
        done.set(id, record);
        ok++;
        if (ok % 20 === 0) {
          flush();
          console.error(`[extract] ✅ ${ok}/${todo.length} (已落盘)`);
        }
      } catch (e) {
        fail++;
        failures.push({ id, error: String(e?.message || e) });
        console.error(`[extract] ⚠️  ${id}: ${e?.message || e}`);
      }
    }
  };

  await Promise.all(Array.from({ length: opts.concurrency }, worker));

  // 最终落盘（按创建时间排序）
  const all = flush();
  if (failures.length) fs.writeFileSync(path.join(OUT_DIR, 'failures.json'), JSON.stringify(failures, null, 2));

  console.error(`[extract] 完成：成功 ${ok}，失败 ${fail}，累计 ${all}/${files.length}`);
  if (fail) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
