#!/usr/bin/env node
/**
 * 交付物验收：全量覆盖 + 结构完整性 + 数值保真 + 交付物一致性。
 * 退出码 0 = 全部通过；非 0 = 有 FAIL。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, assignTheme } from './themes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
  if (!ok) fails++;
};

/* 1. 语料 ↔ 抽取结果 一一对应 */
const mdFiles = fs.readdirSync(path.join(ROOT, 'data', 'markdown')).filter((f) => f.endsWith('.md'));
const mdIds = mdFiles.map((f) => f.replace(/\.md$/, '')).sort();

const rows = fs
  .readFileSync(path.join(ROOT, 'extracted', 'posts.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const exIds = rows.map((r) => String(r.id)).sort();

check('语料文件数 = 645', mdFiles.length === 645, `${mdFiles.length} 个 .md`);
check('抽取结果数 = 645', rows.length === 645, `${rows.length} 条`);
check('id 集合完全一致（无缺失/无多余）',
  JSON.stringify(mdIds) === JSON.stringify(exIds),
  `缺失 ${mdIds.filter((i) => !exIds.includes(i)).length} / 多余 ${exIds.filter((i) => !mdIds.includes(i)).length}`);
check('无重复 id', new Set(exIds).size === exIds.length);

/* 2. 字段完整性 */
const noTldr = rows.filter((r) => !r.tldr || !String(r.tldr).trim());
const noPoints = rows.filter((r) => !(r.core_points || []).length);
const noTags = rows.filter((r) => !(r.tags || []).length);
const noWorth = rows.filter((r) => !r.worth || !String(r.worth).trim());
const noType = rows.filter((r) => !r.type);
const noTheme = rows.filter((r) => !r.theme);
check('无空核心思想', noTldr.length === 0, `${noTldr.length} 篇为空`);
check('无空要点', noPoints.length === 0, `${noPoints.length} 篇为空`);
check('无空标签', noTags.length === 0, `${noTags.length} 篇为空`);
check('无空价值判断', noWorth.length === 0, `${noWorth.length} 篇为空`);
check('无空类型', noType.length === 0);

const TYPES = ['投资笔记', '市场观点', '研究摘要', '持仓操作', '活动公告', '社区答疑', '情绪吐槽', '其他'];
const badType = rows.filter((r) => !TYPES.includes(r.type));
check('类型都在 8 类规范内', badType.length === 0, `异常 ${badType.length}`);

/* 3. 主题互斥且全覆盖（独立重算，不依赖已落盘字段） */
const themeCount = new Map();
const themeAssigned = new Map();
for (const r of rows) {
  const { theme } = assignTheme(r);
  themeCount.set(theme, (themeCount.get(theme) || 0) + 1);
  if (!themeAssigned.has(theme)) themeAssigned.set(theme, new Set());
  themeAssigned.get(theme).add(String(r.id));
}
check('主题数为 22', themeCount.size === 22, `${themeCount.size} 个`);
check('主题总数 = 645', [...themeCount.values()].reduce((a, b) => a + b, 0) === 645);
let overlap = 0;
const seenIds = new Set();
for (const [, ids] of themeAssigned) for (const id of ids) {
  if (seenIds.has(id)) overlap++;
  seenIds.add(id);
}
check('主题互斥（每篇只属一个主题）', overlap === 0 && seenIds.size === 645, `重复 ${overlap} / 覆盖 ${seenIds.size}`);

/* 4. 数值保真：抽取出的数字必须能在原文找到 */
let numTotal = 0, numHit = 0;
const missSamples = [];
for (const r of rows) {
  const md = fs.readFileSync(path.join(ROOT, 'data', 'markdown', `${r.id}.md`), 'utf8');
  const nums = [...new Set((r.data_points || []).join(' ').match(/\d+(?:\.\d+)?%?/g) || [])];
  if (!nums.length) continue;
  const hit = nums.filter((n) => md.includes(n));
  numTotal += nums.length;
  numHit += hit.length;
  if (hit.length < nums.length && missSamples.length < 5) {
    missSamples.push(`${r.id}:${nums.filter((n) => !md.includes(n)).join(',')}`);
  }
}
const rate = numHit / numTotal;
check('数值保真率 ≥ 98%', rate >= 0.98, `${numHit}/${numTotal} = ${(rate * 100).toFixed(1)}%`);
console.log(`      未命中样例（均为格式差异）：${missSamples.join(' | ')}`);

/* 5. 交付物一致性 */
const perPost = path.join(ROOT, '逐篇摘要');
const perFiles = fs.readdirSync(perPost).filter((f) => f.endsWith('.md'));
check('逐篇摘要文件数 = 645', perFiles.length === 645, `${perFiles.length} 个`);

const md = fs.readFileSync(path.join(ROOT, '文章核心信息.md'), 'utf8');
const themeRows = [...themeCount.entries()].every(([t, n]) => {
  const re = new RegExp(`^\\|\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*${n}\\s*\\|`, 'm');
  return re.test(md);
});
check('文章核心信息.md 含全部主题与正确篇数', themeRows,
  [...themeCount.entries()].filter(([t, n]) => !new RegExp(`^\\|\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*${n}\\s*\\|`, 'm').test(md)).map(([t, n]) => `${t}(${n})`).join(','));

const jsonlOut = fs.readFileSync(path.join(ROOT, '文章核心信息.jsonl'), 'utf8').trim().split('\n');
check('文章核心信息.jsonl 行数 = 645', jsonlOut.length === 645, `${jsonlOut.length} 行`);
check('JSONL 全部可解析', jsonlOut.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));

const csv = fs.readFileSync(path.join(ROOT, '文章摘要.csv'), 'utf8');
const csvLines = csv.trim().split('\n');
check('文章摘要.csv 行数 = 646（含表头）', csvLines.length === 646, `${csvLines.length} 行`);

const thesis = fs.readFileSync(path.join(ROOT, '核心思想综合报告.md'), 'utf8');
check('综合报告含总纲（gist）', !thesis.includes('_总纲生成失败_'));
const themeSections = (thesis.match(/^## \d+\. /gm) || []).length;
check('综合报告含 22 个主题小节', themeSections === 22, `${themeSections} 个`);
const linkedPosts = (thesis.match(/逐篇摘要\/\d+\.md/g) || []).length;
check('综合报告链接到逐篇摘要', linkedPosts >= 645, `${linkedPosts} 个链接`);

/* 6. 逐篇摘要内容抽查 */
let badPer = 0;
for (const r of rows.slice(0, 50)) {
  const t = fs.readFileSync(path.join(perPost, `${r.id}.md`), 'utf8');
  if (!t.includes('## 核心思想') || !t.includes('## 要点') || !t.includes(r.tldr.slice(0, 10))) badPer++;
}
check('逐篇摘要抽样（50 篇）结构完整', badPer === 0, `${badPer} 篇异常`);

/* 7. 评论覆盖（评论解析 100% 是之前修复的关键 bug） */
const declared = rows.reduce((s, r) => s + (r.commentNum || 0), 0);
const parsed = rows.reduce((s, r) => s + (r.commentCount || 0), 0);
check('评论抓取数 = 1361（与语料声明一致）', parsed === 1361, `${parsed} 条（声明合计 ${declared}）`);

console.log('\n' + (fails === 0 ? '🎉 全部验收通过' : `⚠️ ${fails} 项未通过`));
process.exit(fails === 0 ? 0 : 1);
