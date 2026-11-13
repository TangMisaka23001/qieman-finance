#!/usr/bin/env node
/**
 * 数据脱敏器：把抓取产物里的个人信息剥离/替换，使其可以安全地公开。
 *
 * 处理内容：
 *   1. 结构化 JSON（posts/*.json、all_posts.json、raw/list/*.json、index.json）
 *      - 删除用户标识字段：brokerUserId / userName / userAvatarUrl / toUserName /
 *        toUserAvatarUrl / toUserId / ipLocation / sensors-anonymous-id 等
 *      - 保留内容、互动数、时间等分析需要的字段
 *   2. Markdown（data/markdown/*.md）
 *      - **只**在「## 评论」小节里，把评论者昵称替换为稳定的假名（读者001、读者002…）
 *      - 「回复 @xxx」中的被回复者昵称一并假名化，且保留 ` · ` 分隔空格
 *      - 正文（含中奖名单表格、微博引用块）一律不动
 *   3. 抽取产物（extracted/*.jsonl）与根目录交付物
 *      - 按「严格词边界」规则替换正文中残留的真实昵称
 *
 * 三条关键规则（都来自实测取证，勿轻易改动）：
 *   A. 词边界：只有当昵称左右两侧都不与其首尾字符构成「中日韩汉字或字母数字」相连时
 *      才替换。这样 `简单说两句`（`简单` 后接汉字）不会被误伤，而 `FF568的医药医疗`
 *      这类真昵称仍能命中。
 *   B. 常用词豁免：16 个在正文里是普通词汇的昵称（`是为`/`简单`/`执着`…）在自由文本里
 *      一律不替换，因为它们承担语义。评论头里仍然假名化（那里它确定是人名）。
 *   C. 作用域：Markdown 只处理评论小节；正文中的中獎名单、微博引用等属于内容本身。
 *
 * 幂等：假名表落盘到 extracted/alias_map.json，重复执行结果一致。
 * 用法：node tools/sanitize.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

/** 需要整字段删除的用户标识 */
const DROP_KEYS = new Set([
  'brokerUserId', 'userName', 'userAvatarUrl', 'toUserName', 'toUserAvatarUrl',
  'toUserId', 'toUserLevel', 'toUserBadgeWear', 'ipLocation', 'userDays',
  'answerUserIdList', 'answerUserAvatarUrlList', 'sensors-anonymous-id',
  'userFollowed', 'userBeFollowed', 'canDelete', 'poCode',
]);

/** 保留但需要替换为占位符的字段 */
const MASK_KEYS = new Map([
  ['userLabel', '长赢指数投资计划主理人'],
]);

/** 作者昵称：保留（是内容主体，非隐私） */
const AUTHOR = 'ETF拯救世界';

/**
 * 规则 B：这些昵称在正文里是普通词汇，自由文本中必须豁免，否则会破坏语义。
 * 命中样例：`是为了…` `简单说两句…` `执着应放在珍惜已有之物上` `不应一味随波逐流`
 *
 * 注意：`Llella` 早期被误列为常用词，但它在原文里是真昵称（评论者 Llella），
 * 只在自由文本豁免名单里出现过 2 次「是个人」类误伤，实为真名 → 已移出本名单，
 * 改由「严格词边界」规则处理。
 */
const COMMON_WORDS = new Set([
  '是为', '简单', '随波逐流', '执着', '是个人', '一一', '心大', '不高兴',
  'movin', '极简', '潜伏', 'zyy', '莫沉', '万里挑一', '繁花',
]);

/**
 * 规则 B+：这些是逐条核对过上下文的**真实评论者昵称**，但它们后面紧跟汉字
 * （`新米练习菌今日这份收益52%`），严格词边界会跳过它们。
 * 人工确认它们不是普通词汇，因此强制替换。
 */
const FORCE_ALIAS = new Set([
  '新米练习菌', '红魔披头士', '阿观', '瑞鹤仙', '仙姑', 'dumdum霞', '此木君',
  '中医师王丹', 'E学研究员', '小番茄的储蓄罐', '秦岭山人', '南风不及你温柔', '同福',
]);

/* ---------------- 假名表 ---------------- */
const ALIAS_FILE = path.join(ROOT, 'extracted', 'alias_map.json');
const alias = fs.existsSync(ALIAS_FILE) ? JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')) : {};
// 幂等：把上一轮生成的假名条目剔除，避免「读者001 → 读者657」这类二次映射
for (const k of Object.keys(alias)) {
  if (/^读者\d{3}$/.test(k)) delete alias[k];
}
let aliasSeq = Object.keys(alias).length;

const ALIAS_RE = /^读者\d{3}$/;

function aliasOf(name) {
  if (!name) return name;
  if (ALIAS_RE.test(name)) return name; // 已经是假名，保持不动
  if (alias[name]) return alias[name];
  aliasSeq += 1;
  const a = `读者${String(aliasSeq).padStart(3, '0')}`;
  alias[name] = a;
  return a;
}

/* ---------------- 1. JSON ---------------- */
function sanitizeJson(obj, stats) {
  if (Array.isArray(obj)) return obj.map((v) => sanitizeJson(v, stats));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DROP_KEYS.has(k)) { stats.dropped++; continue; }
      if (MASK_KEYS.has(k)) { out[k] = MASK_KEYS.get(k); stats.masked++; continue; }
      out[k] = sanitizeJson(v, stats);
    }
    return out;
  }
  return obj;
}

const jsonStats = { dropped: 0, masked: 0, files: 0 };

function walkJson(dir, filter) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, filter);
    else if (filter(e.name)) {
      const raw = fs.readFileSync(p, 'utf8');
      let data;
      try { data = JSON.parse(raw); } catch { continue; }
      const clean = sanitizeJson(data, jsonStats);
      jsonStats.files++;
      if (!DRY) fs.writeFileSync(p, JSON.stringify(clean, null, 2) + '\n');
    }
  }
}

walkJson(path.join(ROOT, 'data', 'posts'), (n) => n.endsWith('.json'));
walkJson(path.join(ROOT, 'data', 'raw'), (n) => n.endsWith('.json'));
for (const f of ['all_posts.json', 'index.json']) {
  const p = path.join(ROOT, 'data', f);
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const clean = sanitizeJson(data, jsonStats);
  jsonStats.files++;
  if (!DRY) fs.writeFileSync(p, JSON.stringify(clean, null, 2) + '\n');
}

/* ---------------- 2. Markdown 昵称假名化（只作用于评论小节） ---------------- */
const mdStats = { replaced: 0, files: 0, unknown: 0 };
const MD_DIR = path.join(ROOT, 'data', 'markdown');
const COMMENT_HEADING = '\n## 评论';

if (fs.existsSync(MD_DIR)) {
  for (const f of fs.readdirSync(MD_DIR)) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(MD_DIR, f);
    let md = fs.readFileSync(p, 'utf8');
    const before = md;

    // 切出「## 评论」小节：正文（含中獎名单、微博引用）原样保留
    const cut = md.indexOf(COMMENT_HEADING);
    if (cut === -1) continue;
    const head = md.slice(0, cut);
    let tail = md.slice(cut);

    // 评论头：`**昵称** [回复 @某人] · 时间 · 赞 N`
    tail = tail.replace(/^\*\*([^*\n]+)\*\*/gm, (m, name) => {
      const t = name.trim();
      if (!t || t === AUTHOR || ALIAS_RE.test(t)) return m;
      if (!alias[t]) mdStats.unknown++;
      mdStats.replaced++;
      return `**${aliasOf(t)}**`;
    });

    // `回复 @某人`：用前瞻保住 ` · ` 的分隔空格
    tail = tail.replace(/回复 @([^\n·]+?)(?=\s*·)/g, (m, name) => {
      const t = name.trim();
      if (!t || t === AUTHOR || ALIAS_RE.test(t)) return m;
      if (!alias[t]) mdStats.unknown++;
      mdStats.replaced++;
      return `回复 @${aliasOf(t)}`;
    });

    md = head + tail;
    if (md !== before) {
      mdStats.files++;
      if (!DRY) fs.writeFileSync(p, md);
    }
  }
}

/* ---------------- 3. 抽取产物 + 根目录交付物（严格词边界） ---------------- */
const outStats = { replaced: 0, files: 0 };

const isCJK = (ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
const isAlnum = (ch) => /[0-9A-Za-z]/.test(ch);
/** 邻字符是否与名字端点「连写」 */
const connected = (ch, edge) =>
  !!ch && ((isCJK(ch) && isCJK(edge)) || (isAlnum(ch) && isAlnum(edge)));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 长名优先，避免短名先吃掉长名的前缀
const scrubbable = Object.keys(alias)
  .filter((n) => n && n !== AUTHOR && !COMMON_WORDS.has(n))
  .sort((a, b) => b.length - a.length);
const NAME_RE = new RegExp(scrubbable.map(escapeRe).join('|'), 'g');

/**
 * 规则 A + B：按严格词边界替换真实昵称。
 * 边界不相连才替换 → `简单说两句` 不受影响，`FF568的医药` 会被替换。
 * FORCE_ALIAS 里的名字跳过边界判断（已人工确认为真昵称）。
 */
function scrubText(text) {
  if (!text || typeof text !== 'string') return text;
  if (!scrubbable.length) return text;
  let hit = false;
  const out = text.replace(NAME_RE, (m, offset, whole) => {
    const before = whole[offset - 1] || '';
    const after = whole[offset + m.length] || '';
    if (!FORCE_ALIAS.has(m)
      && (connected(before, m[0]) || connected(after, m[m.length - 1]))) return m;
    hit = true;
    outStats.replaced++;
    return alias[m];
  });
  return hit ? out : text;
}

function scrubRow(r) {
  for (const k of ['tldr', 'worth', 'actionable', 'domain', 'title']) {
    if (typeof r[k] === 'string') r[k] = scrubText(r[k]);
  }
  for (const k of ['core_points', 'author_views', 'data_points', 'entities', 'tags']) {
    if (Array.isArray(r[k])) r[k] = r[k].map((v) => (typeof v === 'string' ? scrubText(v) : v));
  }
  return r;
}

const SRC = path.join(ROOT, 'extracted', 'posts.jsonl');
if (fs.existsSync(SRC)) {
  const rows = fs.readFileSync(SRC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const r of rows) scrubRow(r);
  outStats.files++;
  if (!DRY) fs.writeFileSync(SRC, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// 根目录交付物：逐篇摘要 + jsonl + csv + 两份 md
const PER = path.join(ROOT, '逐篇摘要');
if (fs.existsSync(PER)) {
  for (const f of fs.readdirSync(PER)) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(PER, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = scrubText(before);
    if (after !== before) {
      outStats.files++;
      if (!DRY) fs.writeFileSync(p, after);
    }
  }
}
for (const f of ['文章核心信息.md', '核心思想综合报告.md', '文章核心信息.jsonl', '文章摘要.csv', '提取概览.md']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = scrubText(before);
  if (after !== before) {
    outStats.files++;
    if (!DRY) fs.writeFileSync(p, after);
  }
}

// extracted/ 下的其他中间产物（thesis_cache.json / overview_cache.json 等）
const EXTRACTED = path.join(ROOT, 'extracted');
if (fs.existsSync(EXTRACTED)) {
  for (const f of fs.readdirSync(EXTRACTED)) {
    if (f === 'alias_map.json') continue; // 别名表本身就是映射表，必须排除
    const p = path.join(EXTRACTED, f);
    if (!fs.statSync(p).isFile()) continue;
    if (!/\.(json|jsonl|log|out)$/.test(f)) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = scrubText(before);
    if (after !== before) {
      outStats.files++;
      if (!DRY) fs.writeFileSync(p, after);
    }
  }
}

if (!DRY) {
  fs.mkdirSync(path.dirname(ALIAS_FILE), { recursive: true });
  fs.writeFileSync(ALIAS_FILE, JSON.stringify(alias, null, 2));
}

console.log(`[sanitize] JSON：${jsonStats.files} 个文件，删除字段 ${jsonStats.dropped} 个，替换 ${jsonStats.masked} 个`);
console.log(`[sanitize] Markdown 昵称：${mdStats.files} 个文件，替换 ${mdStats.replaced} 处（表外新名 ${mdStats.unknown}），别名表 ${Object.keys(alias).length} 条`);
console.log(`[sanitize] 交付物：${outStats.files} 个文件，替换 ${outStats.replaced} 处`);
if (DRY) console.log('[sanitize] --dry-run：未写入任何文件');
