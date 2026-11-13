#!/usr/bin/env node
/**
 * 重渲染 data/markdown/<id>.md。
 *
 * 背景：脱敏过程中出现了两处损坏，需要用「原始昵称 + 干净正文」重新渲染 markdown：
 *   1. 昵称假名化的正则吞掉了评论头与时间之间的分隔空格（`**读者001** 回复 @读者002· 时间`）；
 *   2. 正文里被「全文替换」误伤（`简单`→`读者397` 之类），以及正文中奖名单被假名化。
 *
 * 因此本脚本同时读取两份数据并合并：
 *   --raw   含真实昵称的原始 JSON（评论头需要它才能渲染出昵称）
 *   --clean 已删除用户标识字段、正文未被污染的 JSON（正文需要它保证语义正确）
 *
 * 合并规则：clean 有的字段一律以 clean 为准（正文、评论正文）；clean 没有的字段
 * （userName / toUserName 等已被删除的用户标识）保留 raw 的值，只用于渲染评论头，
 * 不会写回 JSON。
 *
 * 只写 data/markdown/*.md，不会碰 index.json / all_posts.json / posts/*.json。
 *
 * 用法：
 *   node tools/render_markdown.mjs --raw /tmp/qieman-backup/data --clean data
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../rebuild_markdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RAW = path.resolve(arg('--raw', path.join(ROOT, 'data')));
const CLEAN = path.resolve(arg('--clean', path.join(ROOT, 'data')));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'data', 'markdown')));
const UNIVERSE_FILE = path.join(ROOT, 'extracted', 'nickname_universe.json');

/**
 * 合并：clean 优先，clean 缺失的键保留 raw。
 * 数组按下标逐项合并；clean 数组更短时，尾部元素直接取 raw。
 */
function merge(raw, clean) {
  if (clean === undefined) return raw;
  if (Array.isArray(raw) && Array.isArray(clean)) {
    const out = [];
    for (let i = 0; i < Math.max(raw.length, clean.length); i++) {
      out.push(i < clean.length ? merge(raw[i], clean[i]) : raw[i]);
    }
    return out;
  }
  if (raw && typeof raw === 'object' && clean && typeof clean === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = k in clean ? merge(v, clean[k]) : v;
    }
    for (const [k, v] of Object.entries(clean)) {
      if (!(k in out)) out[k] = v;
    }
    return out;
  }
  return clean;
}

/* ---------------- 昵称全集 ---------------- */
const universe = [];
const seen = new Set();
function addName(n) {
  if (typeof n !== 'string') return;
  const t = n.trim();
  if (!t || seen.has(t)) return;
  seen.add(t);
  universe.push(t);
}

// 1) 原始 JSON 的用户标识字段
const rawPosts = path.join(RAW, 'posts');
if (fs.existsSync(rawPosts)) {
  for (const f of fs.readdirSync(rawPosts).filter((f) => /^\d+\.json$/.test(f)).sort()) {
    const p = JSON.parse(fs.readFileSync(path.join(rawPosts, f), 'utf8'));
    addName(p.userName);
    for (const c of p.commentList || []) {
      addName(c.userName);
      addName(c.toUserName);
    }
  }
}

// 2) markdown 评论头与「回复 @xxx」里的提及（覆盖正文里的微博引用块等）
const mdFiles = fs.existsSync(path.join(OUT, 'markdown')) ? [] : null;
const scanDir = path.join(RAW, 'markdown');
if (fs.existsSync(scanDir)) {
  for (const f of fs.readdirSync(scanDir).filter((f) => f.endsWith('.md'))) {
    const md = fs.readFileSync(path.join(scanDir, f), 'utf8');
    for (const m of md.matchAll(/^\*\*([^*\n]+)\*\*/gm)) addName(m[1]);
    for (const m of md.matchAll(/回复\s*@([^\n·]+?)\s*(?=[·\n])/g)) addName(m[1]);
  }
}

/* ---------------- 渲染 ---------------- */
fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
let bad = 0;
const failures = [];
for (const f of fs.readdirSync(rawPosts).filter((f) => /^\d+\.json$/.test(f))) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rawPosts, f), 'utf8'));
    let clean;
    const cleanPath = path.join(CLEAN, 'posts', f);
    if (fs.existsSync(cleanPath)) clean = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
    const merged = clean === undefined ? raw : merge(raw, clean);
    fs.writeFileSync(path.join(OUT, f.replace(/\.json$/, '.md')), renderMarkdown(merged), 'utf8');
    ok++;
  } catch (e) {
    bad++;
    failures.push(`${f}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(UNIVERSE_FILE), { recursive: true });
fs.writeFileSync(UNIVERSE_FILE, JSON.stringify(universe, null, 2) + '\n', 'utf8');

console.log(`[render] 重渲染 ${ok} 篇，失败 ${bad}`);
console.log(`[render] 昵称全集 ${universe.length} 个 → extracted/nickname_universe.json`);
if (failures.length) console.log(failures.slice(0, 10).join('\n'));
