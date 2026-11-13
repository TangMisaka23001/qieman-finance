# qieman-finance

且慢社区用户「ETF拯救世界」（长赢指数投资计划主理人）全部图文帖的**抓取 + 内容抽取 + 核心思想综合**流水线。

645 篇文章（2025-10-22 ~ 2026-11-10）经 LLM 抽取为结构化的核心思想、要点、数据点、实体、标签与可执行动作，再按 22 个规范主题做跨文章综合。

> 📌 本仓库已**脱敏**后开源：不含任何访问令牌、API Key、内部网关地址、用户 ID、IP 属地或真实评论者昵称。
> 详见下方「脱敏说明」。

---

## 目录结构

```
qieman-finance/
├── README.md                    本文件
├── .gitignore                   凭据 / 别名表 / 中间产物的排除规则
│
├── qieman_crawler.mjs           爬虫：列表分页 + 逐帖详情，串行限速、指数退避重试、断点续爬
├── rebuild_markdown.mjs         渲染 / 元数据模块（被爬虫复用），可独立全量重建 markdown 与索引
├── verify_crawl.mjs             抓取完整性校验
│
├── tools/                       内容抽取与报告生成
│   ├── extract.mjs              主抽取器：markdown → prompt → LLM → 结构化 JSONL
│   ├── themes.mjs               22 个规范主题表 + 关键词打分函数（报告与综合共用口径）
│   ├── build-report.mjs         编译主交付物（md / jsonl / csv / 逐篇摘要 / 概览）
│   ├── build-thesis.mjs         主题聚类 + LLM 跨文章综合 → 核心思想综合报告
│   ├── verify-deliverables.mjs  交付物验收（24 项检查）
│   ├── sanitize.mjs             脱敏器：剥离 PII、按词边界做昵称假名化
│   ├── render_markdown.mjs      用「原始昵称 + 干净正文」合并重渲染 markdown
│   ├── patch-meta.mjs           回填单行元信息（点赞/评论/收藏）
│   ├── llm-config.mjs           LLM 网关配置与凭据读取
│   ├── diag-gateway.mjs         网关诊断（空响应率 / 耗时 / finish_reason）
│   ├── test-tokens.mjs          max_tokens 对照实验
│   ├── gen-site-meta.mjs        生成站点元数据（主题归属 + 分布统计）
│   └── build-site.mjs           把抽取产物整理成 Quartz 的 content/ 内容树
│
├── content/                     Quartz 站点内容（由 tools/build-site.mjs 生成）
│   ├── index.md                 站点首页
│   ├── original/<id>.md         645 篇原文（供站点构建）
│   ├── summary/<id>.md          645 篇摘要（供站点构建）
│   └── report/*.md              3 份报告（供站点构建）
│
├── quartz/                      Quartz v4.5.2 站点生成器源码
├── quartz.config.ts             站点配置（标题 / 中文 locale / baseUrl / 主题色）
├── quartz.layout.ts             站点布局
├── package.json                 npm 依赖与 site:build / site:preview 脚本
├── .github/workflows/deploy.yml GitHub Pages 自动部署
│
├── data/                        抓取产物（已脱敏）
│   ├── markdown/<id>.md         645 篇可读正文 + 评论
│   ├── posts/<id>.json          645 篇 /post/info 原始响应（已剥离 PII）
│   ├── raw/list/page_XXX.json   列表接口分页响应
│   ├── index.json               全部帖子元数据索引
│   ├── all_posts.json           全部帖子完整数据合并
│   └── post_ids.json            全部帖子 id
│
├── extracted/                   抽取中间产物
│   ├── posts.jsonl              645 条结构化抽取结果（最终产物）
│   ├── thesis_cache.json        22 个主题的 LLM 综合结果缓存
│   └── overview_cache.json      总纲缓存
│
├── 逐篇摘要/<id>.md             645 个单篇摘要文件
├── 核心思想综合报告.md           跨文章主题级综合结论
├── 文章核心信息.md               主索引（按主题分章 + 全部要点清单）
├── 文章核心信息.jsonl            同一份数据的结构化版本
├── 文章摘要.csv                 表格版（20 列）
└── 提取概览.md                  方法、选型、统计与质量验证
```

---

## 快速开始

### 1. 配置凭据

所有敏感信息通过环境变量注入，**不要写进代码**：

```bash
# 抓取用：且慢社区当前会话的 Bearer token（会过期，需从浏览器 DevTools 复制）
export QIEMAN_TOKEN='<your-token>'

# LLM 用：任意 OpenAI 兼容接口
export LLM_API_KEY='<your-key>'
export LLM_BASE_URL='https://your-gateway/v1'   # 可选，默认 https://api.openai.com/v1
export LLM_MODEL='your-model'                   # 可选，默认 gpt-4o-mini
```

可选：`QIEMAN_SPACE_USER_ID`（换人抓取）、`QIEMAN_SENSORS_ID`、`LLM_FALLBACK_MODELS`。

### 2. 抓取

```bash
node qieman_crawler.mjs                 # 断点续爬（已存在帖子默认跳过）
node qieman_crawler.mjs --force         # 强制全部重爬
node qieman_crawler.mjs --with-comments # 额外补全每帖全量评论
node rebuild_markdown.mjs               # 仅从 posts/*.json 重建 markdown + index
node verify_crawl.mjs                   # 校验完整性
```

### 3. 抽取与报告

```bash
node tools/extract.mjs --concurrency 16        # 抽取全部文章 → extracted/posts.jsonl
node tools/build-thesis.mjs                     # 主题综合 → 核心思想综合报告.md
node tools/build-report.mjs                     # 编译全部交付物
node tools/verify-deliverables.mjs              # 24 项验收
node tools/sanitize.mjs                         # 脱敏（提交前必须执行）
```

### 4. 构建站点

```bash
npm ci                                    # 安装 Quartz 依赖（487 个包）
npm run site:build                        # 整理 content/ 并构建 → public/
npm run site:preview                      # 本地预览 http://localhost:8080
```

站点由 `.github/workflows/deploy.yml` 在 `main` 分支推送后自动构建并发布到 GitHub Pages：
<https://TangMisaka23001.github.io/qieman-finance>

> **首次部署需要在仓库 Settings → Pages → Build and deployment 把 Source 设为 "GitHub Actions"。**
> 这是 GitHub 的硬性要求：`actions/configure-pages` 的自动启用功能需要 PAT 级别的令牌，仓库内置的 `GITHUB_TOKEN` 无权开启 Pages。

---

## 抽取管线

### 抽取 schema

| 字段 | 含义 |
| --- | --- |
| `tldr` | 一句话核心思想 |
| `core_points` | 要点列表 |
| `author_views` | 作者本人观点（与读者观点区分） |
| `data_points` | 原文数值（点位、涨跌幅、仓位占比等） |
| `entities` | 指数 / 基金 / 板块 / 人物 |
| `domain` | 领域分类 |
| `tags` | 标签 |
| `worth` | 价值判断（值不值得深读） |
| `actionable` | 可执行动作 |
| `type` | 8 类内容分类：投资笔记 / 市场观点 / 研究摘要 / 持仓操作 / 活动公告 / 社区答疑 / 情绪吐槽 / 其他 |

### 主题体系

`tools/themes.mjs` 定义 22 个规范主题（指数投资与长赢策略、仓位管理与择时纪律、市场估值与风险识别、资产配置与股债搭配、红利策略与高股息、基金研究与投顾产品、投资心理与情绪管理、市场情绪与资金行为、宏观策略与全球配置、技术分析与盘面观察、投资体系与方法论、个人财富管理与消费、财务自由与退休规划、财富观与人生哲学、人际关系与职场生活、投资者教育与认知提升、投资社区争议与信任、AI 工具与知识管理、量化投资与工具开发、社区运营与活动公告、生活感悟与日常记录、其他杂谈），按关键词打分归类，**互斥且 100% 覆盖**。

> 为什么不用 LLM 自由标签聚类：LLM 生成的 `tags` / `domain` 极度碎片化（223 种 domain），任何相似度聚类都不可靠（曾塌成 1 簇 600 篇）。

---

## 关键工程决策

1. **评论区必须解析**。原正则有两个 bug：多行评论被截断成首行、「回复 @xxx」格式的评论整段丢失，导致 56665 的持仓明细表完全消失。改为「先定位所有评论头位置、再按位置切片正文」后，评论覆盖率 **1361/1361 = 100%**。
2. **`max_tokens` 必须 ≥ 12000**。模型的 `reasoning_content` 会吃光 token 预算，`max_tokens=4000` 时 `finish=length` 导致空响应（3 次只成功 1 次）；12000 时 3/3 成功且更快。
3. **主题聚类不用 LLM 自由标签**（见上）。
4. **总纲需独立 system prompt**。主题综合的系统提示要求输出 `theme/essence/claims`，与总纲要求的 `gist/key_conclusions` 冲突，会静默返回错误结构 —— 因此总纲单独用一套提示并加显式结构校验。
5. **元信息是单行**。原 md 的 `- 点赞: N  评论: N  收藏: N` 在同一行，行首锚定正则会静默取到 0，已改为整行匹配后回填。

---

## 质量验证

`node tools/verify-deliverables.mjs` → 24 项全部通过：

- 语料 645 个 md ↔ 抽取 645 条，id 集合完全一致，缺失 0 / 多余 0 / 重复 0
- 无空核心思想、无空要点、无空标签、无空价值判断、无空类型
- 22 个主题互斥，覆盖 645/645
- **数值保真率 99.0%**（3925/3965 个抽取数字可回溯到原文；未命中的经逐一核查全部是格式差异，如原文 `2.26` 抽取为 `2.26%`）
- 评论抓取数 1361，与语料声明一致

---

## 脱敏说明

`tools/sanitize.mjs` 对全部产物做了如下处理：

| 类别 | 处理方式 |
| --- | --- |
| 访问令牌 / Bearer token | 从代码中移除，改为 `QIEMAN_TOKEN` 环境变量注入 |
| LLM API Key | 从代码中移除，改为 `LLM_API_KEY` 环境变量注入 |
| 内部网关地址 | 从代码中移除，改为 `LLM_BASE_URL` 环境变量注入 |
| 设备指纹 `sensors-anonymous-id` | 改为 `QIEMAN_SENSORS_ID` 环境变量注入 |
| 用户标识（`brokerUserId` / `userName` / `userAvatarUrl` / `toUserName` / `toUserId` / `userDays`） | 从 JSON 中删除 |
| IP 属地 `ipLocation` | 从 JSON 中删除 |
| 评论者昵称 | 在 markdown **评论小节**与「回复 @」位置替换为 `读者001`、`读者002` … 稳定假名（作者昵称保留） |
| 抽取产物中残留的昵称 | 按「严格词边界」规则替换（见下） |
| 昵称→假名映射表 | `extracted/alias_map.json`，已由 `.gitignore` 排除 |

正文、评论正文、点赞/评论数/收藏数、时间戳、链接等分析所需信息均完整保留。

### 昵称替换的边界规则

评论者昵称里混着不少普通词汇（`简单`、`是为`、`执着`、`随波逐流`…）。直接做全文替换会
毁掉正文语义（`简单说两句我认为股票赚钱的本质` → `读者397说两句…`），因此采用两条规则：

1. **严格词边界**：只有当昵称左右两侧都不与其首尾字符构成「汉字或字母数字」相连时才替换。
   于是 `FF568的医药医疗` 会被替换，而 `简单说两句` 不会。
2. **常用词豁免**：16 个在正文里承担语义的昵称（`是为` / `简单` / `随波逐流` / `执着` / `是个人` /
   `一一` / `心大` / `不高兴` / `movin` / `极简` / `潜伏` / `Llella` / `zyy` / `莫沉` /
   `万里挑一` / `繁花`）在自由文本中一律不替换。

此外 **markdown 只处理 `## 评论` 小节**：正文里的中獎名单表格、微博引用块属于文章内容本身，
其中的名字保持原样。

---

## 数据来源与免责声明

- 数据来自且慢社区公开接口，抓取对象为该社区用户「ETF拯救世界」公开发布的图文帖。
- 本仓库仅用于个人研究与方法论演示，**不构成任何投资建议**。
- 作者观点的版权归原作者所有。
