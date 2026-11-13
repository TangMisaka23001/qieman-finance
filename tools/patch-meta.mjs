#!/usr/bin/env node
/**
 * 回填 markdown 元信息里被漏解析的「评论 / 收藏」数字。
 * 背景：原 md 的元信息是单行 `- 点赞: 1177  评论: 799  收藏: 152`，
 * 而 extract.mjs 的 RE_FIELD 是行首锚定 (`^- 评论:`) → 永远匹配不到 → 写成 0。
 * 另注意两个「评论数」含义不同：
 *   - meta.commentNum  = 社区实际评论数（可能上千，帖子页显示）
 *   - body.commentCount = 实际抓取到的评论条数（md 里 `## 评论 (N 条)` 的 N，全库共 1361）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extracted', 'posts.jsonl');

const rows = fs.readFileSync(SRC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const RE_SOCIAL = /^- 点赞:\s*(\d+)\s+评论:\s*(\d+)\s+收藏:\s*(\d+)/m;

let patched = 0, changed = 0;
for (const r of rows) {
  const md = fs.readFileSync(path.join(ROOT, 'data', 'markdown', `${r.id}.md`), 'utf8');
  const head = md.slice(0, md.indexOf('## 正文'));
  const m = head.match(RE_SOCIAL);
  if (!m) continue;
  patched++;
  const [likes, commentNum, collections] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (r.likes !== likes || r.commentNum !== commentNum || r.collections !== collections) changed++;
  r.likes = likes;
  r.commentNum = commentNum;
  r.collections = collections;
}

// 按 createdAt 排序，与 extract.mjs 的落盘顺序一致
rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
fs.writeFileSync(SRC, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`[patch-meta] 已回填 ${patched} 篇，其中 ${changed} 篇数值发生变化`);
console.log(`[patch-meta] 评论数合计（社区实际）: ${rows.reduce((s, r) => s + (r.commentNum || 0), 0)}`);
console.log(`[patch-meta] 抓取到的评论条数合计: ${rows.reduce((s, r) => s + (r.commentCount || 0), 0)}`);
console.log(`[patch-meta] 点赞合计: ${rows.reduce((s, r) => s + (r.likes || 0), 0)}`);
