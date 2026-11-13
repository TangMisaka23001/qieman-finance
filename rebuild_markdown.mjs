#!/usr/bin/env node
/**
 * 从 posts/*.json 重新生成 markdown/<id>.md 并修正 index.json 的派生字段。
 * 兼容两种数据形态:
 *   1) 新结构: content.contents[] (contentType=1 文本 / 2 图片), content.images[]
 *   2) 旧结构: content 为空, 正文在顶层 richContent(HTML) / summary, 图片在顶层 images[]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'data');
const postsDir = path.join(root, 'posts');
const mdDir = path.join(root, 'markdown');
fs.mkdirSync(mdDir, { recursive: true });

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ldquo;': '“', '&rdquo;': '”', '&hellip;': '…' };

/** HTML -> 纯文本 (保留段落换行, 图片转 markdown) */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![]($1)\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n\n');
  s = s.replace(/<li[^>]*>/gi, '- ');
  s = s.replace(/<[^>]+>/g, '');
  for (const [k, v] of Object.entries(ENT)) s = s.split(k).join(v);
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 提取正文文本块与图片 (兼容新旧两种结构) */
export function extractBody(post, { includeImages = false } = {}) {
  const c = post.content || {};
  const blocks = Array.isArray(c.contents) ? c.contents : [];
  if (blocks.length) {
    const texts = blocks.filter((b) => b.contentType === 1).map((b) => b.detail || '').filter(Boolean);
    const imgs = blocks.filter((b) => b.contentType === 2).map((b) => b.detail).filter(Boolean);
    const extraImgs = Array.isArray(c.images) ? c.images : [];
    return { texts, images: [...new Set([...imgs, ...extraImgs])], schema: 'new' };
  }
  const html = post.richContent || '';
  const text = htmlToText(html) || post.summary || '';
  const imgs = Array.isArray(post.images) ? post.images : [];
  const htmlImgs = [...html.matchAll(/<img[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const textImgs = [...text.matchAll(/!\[\]\(([^)]+)\)/g)].map((m) => m[1]);
  return { texts: [text].filter(Boolean), images: [...new Set([...imgs, ...htmlImgs, ...textImgs])], schema: 'legacy', textWithImgMd: text };
}

export function renderMarkdown(p) {
  const c = p.content || {};
  const body = extractBody(p);
  const lines = [];
  lines.push(`# ${p.title || c.title || '(无标题)'}`);
  lines.push('');
  lines.push(`- 帖子 ID: ${p.id}`);
  lines.push(`- 作者: ${p.userName || ''}${p.userLabel ? ` (${p.userLabel})` : ''}`);
  lines.push(`- 发布时间: ${p.createdAt || ''}`);
  lines.push(`- 点赞: ${p.likeNum ?? 0}  评论: ${p.commentNum ?? 0}  收藏: ${p.collectionCount ?? 0}`);
  lines.push(`- 链接: ${p.url || `https://qieman.com/content/content-detail?postId=${p.id}`}`);
  if (body.schema === 'legacy') lines.push(`- 结构: 旧版 (正文来自 richContent)`);
  lines.push('');
  lines.push('## 正文');
  lines.push('');
  if (body.schema === 'legacy' && body.textWithImgMd) {
    lines.push(body.textWithImgMd);
  } else {
    for (const item of c.contents || []) {
      if (item.contentType === 1) lines.push(item.detail || '');
      else if (item.contentType === 2) lines.push(`![](${item.detail})`);
      else lines.push(item.detail || '');
    }
  }
  if (body.images.length) {
    lines.push('');
    lines.push('## 图片');
    for (const img of body.images) lines.push(`![](${img})`);
  }
  const comments = p.commentList || [];
  lines.push('');
  lines.push(`## 评论 (${comments.length} 条)`);
  lines.push('');
  if (!comments.length) lines.push('(无)');
  for (const cm of comments) {
    const reply = cm.toUserName ? ` 回复 @${cm.toUserName}` : '';
    lines.push(`**${cm.userName || ''}**${reply} · ${cm.createdAt || ''} · 赞 ${cm.likeNum ?? 0}`);
    lines.push('');
    lines.push(cm.content || '');
    lines.push('');
  }
  return lines.join('\n');
}

export function postMeta(p) {
  const c = p.content || {};
  const body = extractBody(p);
  const text = body.schema === 'legacy' ? (body.textWithImgMd || '') : body.texts.join('\n');
  return {
    id: p.id,
    title: p.title || c.title || '',
    intro: c.intro || p.summary || '',
    createdAt: p.createdAt || null,
    modifyAt: p.modifyAt || null,
    likeNum: p.likeNum ?? 0,
    commentNum: p.commentNum ?? 0,
    collectionCount: p.collectionCount ?? 0,
    userLevel: p.userLevel ?? null,
    userLabel: p.userLabel || '',
    ipLocation: p.ipLocation || '',
    url: p.url || `https://qieman.com/content/content-detail?postId=${p.id}`,
    contentTextLength: text.length,
    imageCount: body.images.length,
    commentListLen: (p.commentList || []).length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const files = fs.readdirSync(postsDir).filter((f) => /^\d+\.json$/.test(f));
  let ok = 0, bad = 0, legacy = 0;
  const metas = [];
  for (const f of files) {
    try {
      const post = JSON.parse(fs.readFileSync(path.join(postsDir, f), 'utf8'));
      const b = extractBody(post);
      if (b.schema === 'legacy') legacy++;
      fs.writeFileSync(path.join(mdDir, f.replace(/\.json$/, '.md')), renderMarkdown(post), 'utf8');
      metas.push(postMeta(post));
      ok++;
    } catch (e) { bad++; console.error('失败', f, e.message); }
  }
  metas.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(metas, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'all_posts.json'), JSON.stringify(metas.map((m) => m.id).map((id) => {
    try { return JSON.parse(fs.readFileSync(path.join(postsDir, `${id}.json`), 'utf8')); } catch { return null; }
  }).filter(Boolean), null, 2), 'utf8');
  console.log(`重建完成: markdown ${ok} 篇 (其中旧结构 ${legacy} 篇), 失败 ${bad}, index/all_posts 已刷新`);
}
