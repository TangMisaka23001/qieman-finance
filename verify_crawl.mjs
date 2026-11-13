#!/usr/bin/env node
/** 校验爬取完整性: 列表 id 是否全部有详情、markdown、索引条目 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBody } from './rebuild_markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'data');
const ids = JSON.parse(fs.readFileSync(path.join(root, 'post_ids.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
const indexIds = new Set(index.map((m) => m.id));

const missingPost = [], missingMd = [], missingIndex = [], broken = [];
let minDate = null, maxDate = null, totalChars = 0, totalComments = 0, totalImages = 0, zeroComment = 0;
let user = null;

for (const id of ids) {
  const p = path.join(root, 'posts', `${id}.json`);
  if (!fs.existsSync(p)) { missingPost.push(id); continue; }
  if (!fs.existsSync(path.join(root, 'markdown', `${id}.md`))) missingMd.push(id);
  if (!indexIds.has(id)) missingIndex.push(id);
  try {
    const post = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (post.id !== id) broken.push(id);
    user = post.userName || user;
    const d = post.createdAt || '';
    if (d) { if (!minDate || d < minDate) minDate = d; if (!maxDate || d > maxDate) maxDate = d; }
    const body = extractBody(post);
    totalChars += (body.schema === 'legacy' ? (body.textWithImgMd || '') : body.texts.join('\n')).length;
    const cs = post.commentList || [];
    totalComments += cs.length;
    if ((post.commentNum ?? 0) > 0 && cs.length === 0) zeroComment++;
    totalImages += body.images.length;
  } catch { broken.push(id); }
}

const listPages = fs.readdirSync(path.join(root, 'raw', 'list')).length;
console.log('=== 校验报告 ===');
console.log(`作者: ${user}`);
console.log(`列表 id 总数: ${ids.length}   列表页数: ${listPages}`);
console.log(`详情 json: ${ids.length - missingPost.length}   缺失: ${missingPost.length}${missingPost.length ? ' -> ' + missingPost.slice(0, 10).join(',') : ''}`);
console.log(`markdown : 缺失 ${missingMd.length}${missingMd.length ? ' -> ' + missingMd.slice(0, 10).join(',') : ''}`);
console.log(`index    : 条目 ${index.length}, 缺失 ${missingIndex.length}`);
console.log(`损坏/不匹配: ${broken.length}${broken.length ? ' -> ' + broken.slice(0, 10).join(',') : ''}`);
console.log(`时间范围: ${minDate} ~ ${maxDate}`);
console.log(`正文字符总数: ${totalChars.toLocaleString()}   图片总数: ${totalImages}`);
console.log(`commentList 条数合计: ${totalComments}   (commentNum>0 但 commentList 为空: ${zeroComment} 篇)`);
const failPath = path.join(root, 'failures.json');
if (fs.existsSync(failPath)) console.log(`failures.json: ${JSON.parse(fs.readFileSync(failPath, 'utf8')).length} 条`);
console.log(`all_posts.json: ${fs.existsSync(path.join(root, 'all_posts.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'all_posts.json'), 'utf8')).length + ' 篇' : '缺失'}`);
