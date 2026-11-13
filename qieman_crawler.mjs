#!/usr/bin/env node
/**
 * 且慢社区帖子爬虫
 * 接口:
 *   1) 列表: https://qieman.com/pmdj/v2/community/space/userCenterPost/list
 *   2) 详情: https://qieman.com/pmdj/v2/community/post/info?id=<id>
 *
 * 输出目录: /workspace/qieman/data/
 *   raw/list/page_XXX.json   列表页原始响应
 *   posts/<id>.json          帖子详情原始响应 (含 content / commentList)
 *   markdown/<id>.md          可读版本 (正文 + commentList)
 *   index.json               全部帖子元数据索引
 *   all_posts.json           全部帖子完整数据合并
 *   crawl.log                运行日志
 *
 * 特点: 串行请求、请求间隔可配、失败指数退避重试、断点续爬(已存在的帖子默认跳过)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, postMeta } from './rebuild_markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  spaceUserId: process.env.QIEMAN_SPACE_USER_ID || '793413',
  postType: '1',
  orderBy: 'byCreatedAt',
  pageSize: 50,
  listDelayMs: 1500,      // 列表页间隔
  detailDelayMs: 2000,    // 详情间隔 (基准, 另加 0~500ms 抖动)
  detailJitterMs: 500,
  maxListEmptyPages: 2,   // 连续空页上限, 用于判定列表结束
  fetchTimeoutMs: 30000,
  maxRetries: 5,
  outDir: path.join(__dirname, 'data'),
  force: process.argv.includes('--force'),
  comments: process.argv.includes('--with-comments'), // 可选: 额外爬全量评论
  commentPageSize: 50,
  commentDelayMs: 1200,
};

// 鉴权 Token 属于敏感信息：必须通过环境变量注入，不要提交到版本库。
//   export QIEMAN_TOKEN='<从浏览器 DevTools 复制当前会话的 Bearer token>'
// token 会过期（JWT exp），过期后需重新复制。
const AUTH_TOKEN = process.env.QIEMAN_TOKEN || '';
if (!AUTH_TOKEN) {
  console.error('[crawler] 缺少 QIEMAN_TOKEN 环境变量。请先 export QIEMAN_TOKEN=... 再运行。');
  process.exit(1);
}
const AUTH = `Bearer ${AUTH_TOKEN}`;

const BASE_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Authorization': AUTH,
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0',
  'sensors-anonymous-id': process.env.QIEMAN_SENSORS_ID || 'anonymized-device-id',
};

const LIST_URL = (pageNum, pageSize) =>
  `https://qieman.com/pmdj/v2/community/space/userCenterPost/list?pageNum=${pageNum}&pageSize=${pageSize}&postType=${CONFIG.postType}&spaceUserId=${CONFIG.spaceUserId}&orderBy=${CONFIG.orderBy}`;
const INFO_URL = (id) =>
  `https://qieman.com/pmdj/v2/community/post/info?id=${id}`;
const COMMENT_URL = (postId, pageNum, pageSize) =>
  `https://qieman.com/pmdj/v2/community/comment/list?postId=${postId}&pageNum=${pageNum}&pageSize=${pageSize}&orderBy=byCreatedAt`;

// ---------- 基础工具 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);

const logFile = path.join(CONFIG.outDir, 'crawl.log');
fs.mkdirSync(CONFIG.outDir, { recursive: true });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n'); } catch {}
}

class HttpError extends Error {
  constructor(status, body) { super(`HTTP ${status}`); this.status = status; this.body = body; }
}

async function fetchJson(url, referer, attempt = 0) {
  let res, body;
  try {
    res = await fetch(url, {
      headers: { ...BASE_HEADERS, 'Referer': referer },
      signal: AbortSignal.timeout(CONFIG.fetchTimeoutMs),
    });
  } catch (e) {
    if (attempt < CONFIG.maxRetries) {
      const wait = 2000 * 2 ** attempt;
      log(`请求异常, ${wait}ms 后重试 (${attempt + 1}/${CONFIG.maxRetries}): ${url} :: ${e.message}`);
      await sleep(wait);
      return fetchJson(url, referer, attempt + 1);
    }
    throw e;
  }
  body = await res.text();
  if (res.status === 429 || res.status >= 500) {
    if (attempt < CONFIG.maxRetries) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt;
      log(`HTTP ${res.status}, ${wait}ms 后重试 (${attempt + 1}/${CONFIG.maxRetries}): ${url}`);
      await sleep(wait);
      return fetchJson(url, referer, attempt + 1);
    }
    throw new HttpError(res.status, body.slice(0, 300));
  }
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(res.status, body.slice(0, 300)); // 鉴权失效, 不重试
  }
  if (!res.ok) throw new HttpError(res.status, body.slice(0, 300));
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error(`JSON 解析失败 (${url}): ${body.slice(0, 200)}`);
  }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
};
const writeText = (p, text) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
};

// ---------- 列表 ----------
async function crawlList() {
  const dir = path.join(CONFIG.outDir, 'raw', 'list');
  fs.mkdirSync(dir, { recursive: true });
  const ids = [];
  const seen = new Set();
  let emptyStreak = 0;
  let page = 1;
  while (emptyStreak < CONFIG.maxListEmptyPages) {
    const file = path.join(dir, `page_${String(page).padStart(3, '0')}.json`);
    let items;
    if (fs.existsSync(file) && !CONFIG.force) {
      try { items = readJson(file); log(`列表页 ${page} 已存在, 跳过请求`); }
      catch { items = null; }
    }
    if (!items) {
      log(`请求列表页 ${page} (pageSize=${CONFIG.pageSize})`);
      items = await fetchJson(LIST_URL(page, CONFIG.pageSize), `https://qieman.com/content/user-space?spaceUserId=${CONFIG.spaceUserId}&tabKey=content`);
      writeJson(file, items);
      await sleep(CONFIG.listDelayMs + rand(400));
    }
    if (!Array.isArray(items) || items.length === 0) {
      emptyStreak++;
      log(`列表页 ${page} 为空 (连续空页 ${emptyStreak})`);
      page++;
      continue;
    }
    emptyStreak = 0;
    let added = 0;
    for (const it of items) {
      if (it && it.id != null && !seen.has(it.id)) { seen.add(it.id); ids.push(it.id); added++; }
    }
    log(`列表页 ${page}: ${items.length} 条, 新增 ${added} 个 id, 累计 ${ids.length}`);
    if (items.length < CONFIG.pageSize) { log(`本页不足 ${CONFIG.pageSize} 条, 判定列表结束`); break; }
    page++;
  }
  writeJson(path.join(CONFIG.outDir, 'post_ids.json'), ids);
  log(`列表完成, 共 ${ids.length} 个帖子`);
  return ids;
}

// ---------- 详情 ----------
// 渲染/元数据逻辑统一放在 rebuild_markdown.mjs, 兼容新结构(content.contents)与旧结构(richContent)

async function crawlDetails(ids) {
  const dir = path.join(CONFIG.outDir, 'posts');
  const mdDir = path.join(CONFIG.outDir, 'markdown');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(mdDir, { recursive: true });
  const indexPath = path.join(CONFIG.outDir, 'index.json');
  let index = fs.existsSync(indexPath) ? readJson(indexPath) : [];
  const indexById = new Map(index.map((m) => [m.id, m]));

  let done = 0, skipped = 0, failed = 0;
  const failures = [];
  for (const id of ids) {
    const file = path.join(dir, `${id}.json`);
    let post = null;
    if (fs.existsSync(file) && !CONFIG.force) {
      try {
        const cached = readJson(file);
        if (cached && cached.id === id) {
          post = cached;
          skipped++;
          // 断点续爬时若开启全量评论而缓存里没有, 只补评论
          if (CONFIG.comments && !Array.isArray(post.commentsAll) && (post.commentNum || 0) > 0) {
            try {
              post.commentsAll = await crawlComments(id);
              writeJson(file, post);
              writeText(path.join(mdDir, `${id}.md`), renderMarkdown(post));
              log(`补充全量评论 id=${id}: ${post.commentsAll.length} 条`);
            } catch (e) {
              log(`补充评论失败 id=${id}: ${e.message}`);
            }
            await sleep(CONFIG.commentDelayMs);
          }
        }
      } catch {}
    }
    if (!post) {
      try {
        post = await fetchJson(INFO_URL(id), `https://qieman.com/content/content-detail?postId=${id}`);
        if (!post || post.id !== id) throw new Error(`返回 id 不匹配: ${post && post.id}`);
        writeJson(file, post);
        // 可选: 全量评论
        if (CONFIG.comments && post.commentNum > 0) {
          post.commentsAll = await crawlComments(id);
          writeJson(file, post);
        }
        writeText(path.join(mdDir, `${id}.md`), renderMarkdown(post));
        done++;
      } catch (e) {
        failed++;
        failures.push({ id, error: e.message });
        log(`详情失败 id=${id}: ${e.message}`);
        if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
          log('鉴权失效, 停止爬取');
          break;
        }
        await sleep(2000);
        continue;
      }
      await sleep(CONFIG.detailDelayMs + rand(CONFIG.detailJitterMs));
    }
    const meta = postMeta(post);
    indexById.set(meta.id, meta);
    if (done % 20 === 0 || done === 0) {
      index = [...indexById.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      writeJson(indexPath, index);
    }
    if (done > 0 && done % 20 === 0) log(`进度: 新增 ${done}, 跳过 ${skipped}, 失败 ${failed} / 总 ${ids.length}`);
  }
  index = [...indexById.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  writeJson(indexPath, index);
  writeJson(path.join(CONFIG.outDir, 'failures.json'), failures);
  log(`详情完成: 新增 ${done}, 跳过 ${skipped}, 失败 ${failed}`);
  return { done, skipped, failed, failures };
}

async function crawlComments(postId) {
  const all = [];
  let page = 1, emptyStreak = 0;
  while (emptyStreak < 2) {
    const items = await fetchJson(COMMENT_URL(postId, page, CONFIG.commentPageSize), `https://qieman.com/content/content-detail?postId=${postId}`);
    if (!Array.isArray(items) || items.length === 0) { emptyStreak++; page++; continue; }
    emptyStreak = 0;
    all.push(...items);
    if (items.length < CONFIG.commentPageSize) break;
    page++;
    await sleep(CONFIG.commentDelayMs + rand(300));
  }
  return all;
}

// ---------- 合并 ----------
function buildCombined() {
  const dir = path.join(CONFIG.outDir, 'posts');
  const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  const posts = files
    .map((f) => { try { return readJson(path.join(dir, f)); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  writeJson(path.join(CONFIG.outDir, 'all_posts.json'), posts);
  log(`合并完成: ${posts.length} 篇帖子 -> all_posts.json`);
  return posts.length;
}

// ---------- main ----------
(async () => {
  log(`=== 开始爬取 spaceUserId=${CONFIG.spaceUserId} ===`);
  const t0 = Date.now();
  const ids = await crawlList();
  const stats = await crawlDetails(ids);
  const n = buildCombined();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`=== 全部完成: ${n} 篇, 用时 ${secs}s, 输出目录 ${CONFIG.outDir} ===`);
  if (stats.failed > 0) process.exitCode = 2;
})().catch((e) => {
  log(`致命错误: ${e.stack || e.message}`);
  process.exit(1);
});
