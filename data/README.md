# 且慢社区帖子数据（spaceUserId=793413）

> ⚠️ **本目录已脱敏**。原始抓取产物中的个人信息（用户 ID、昵称、头像、IP 属地、设备指纹）
> 已由 `tools/sanitize.mjs` 移除或替换为假名：
> - JSON 中删除了 `brokerUserId` / `userName` / `userAvatarUrl` / `toUserName` / `toUserId` / `ipLocation` / `userDays` 等字段
> - markdown 评论头中的评论者昵称替换为 `读者001`、`读者002` … 稳定假名（作者昵称保留）
> - 假名映射表 `extracted/alias_map.json` 已在 `.gitignore` 中排除，不入库
>
> 内容、互动数（点赞/评论数/收藏数）、时间、正文与评论正文均完整保留。

数据来源：且慢社区接口，抓取时间见 `crawl.log`。

## 抓取结果概览
- 作者：ETF拯救世界（长赢指数投资计划主理人）
- 帖子总数：**645 篇**（列表 13 页 × pageSize=50，第 14 页为空，已到列表末尾）
- 时间范围：**2025-10-22 22:31:33 ~ 2026-11-10 21:27:42**（最早一篇 id=50893）
- 正文合计约 22.9 万字，图片 251 张，`commentList` 共 1361 条
- 失败：0（`failures.json` 为空）

> 说明：`postType=1` 是唯一合法取值（0/2 报 `can not find this enum/type`，3 返回空），因此 645 篇即该账号当前可见的全部图文帖子。

## 接口
- 列表：`GET https://qieman.com/pmdj/v2/community/space/userCenterPost/list?pageNum={n}&pageSize=50&postType=1&spaceUserId=793413&orderBy=byCreatedAt`
- 详情：`GET https://qieman.com/pmdj/v2/community/post/info?id={postId}`

## 目录结构
```
data/
├── README.md            本说明
├── crawl.log            运行日志（含每步耗时与失败记录）
├── post_ids.json        列表接口拿到的全部帖子 id（按列表顺序）
├── index.json           全部帖子元数据索引（按发布时间倒序）
├── all_posts.json       全部帖子完整数据合并（含 content / commentList）
├── failures.json        失败记录（正常为空数组）
├── raw/list/page_XXX.json   列表接口原始分页响应
├── posts/<id>.json      每个帖子的 /post/info 原始响应
└── markdown/<id>.md     每个帖子的可读版本（正文 + 图片 + commentList）
```

## 字段说明（posts/<id>.json 主要字段）
- `id` / `title` / `createdAt` / `modifyAt` / `likeNum` / `commentNum` / `collectionCount` / `url`
- `userLevel` / `userLabel`
- `content.title` / `content.intro` / `content.images`
- `content.contents[]`：正文块，`contentType=1` 为文本（`detail`），`contentType=2` 为图片（`detail` 为图片 URL）
- `commentList[]`：评论（含 `content` / `createdAt` / `likeNum` / `children` 等；用户标识字段已脱敏移除）

### 两种正文结构（已在 markdown/index 中统一处理）
- **新结构**（605 篇）：正文在 `content.contents[]`，图片在 `content.images[]` 或 `contentType=2` 块。
- **旧结构**（40 篇，多为 2025-10 ~ 2026-01 早期帖子）：`content` 为空对象，正文在顶层 `richContent`（HTML）与 `summary`，图片在顶层 `images[]`。
  渲染时会把 HTML 转纯文本写入 `markdown/<id>.md`，并在文首标注 `- 结构: 旧版`；`index.json` 的 `contentTextLength` / `imageCount` 也已按两种结构统一统计。


## 注意
- `/post/info` 返回的 `commentList` 只包含少量精选评论（通常最多 3 条），与 `commentNum` 的总数不一致。本次按需求只使用该字段。
- 若需全量评论，可使用 `GET https://qieman.com/pmdj/v2/community/comment/list?postId={id}&pageNum={n}&pageSize=50&orderBy=byCreatedAt`，并用 `node qieman_crawler.mjs --with-comments` 补爬（已缓存的帖子只会补评论，不重复请求详情）。

## 复现 / 续爬
```bash
node qieman_crawler.mjs                # 断点续爬（已存在帖子默认跳过）
node qieman_crawler.mjs --force        # 强制全部重爬
node qieman_crawler.mjs --with-comments # 额外补全每帖全量评论
node rebuild_markdown.mjs              # 仅从 posts/*.json 重建 markdown
```
