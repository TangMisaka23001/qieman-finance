import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"
import { QuartzPluginData } from "./quartz/plugins/vfile"
import { getDate } from "./quartz/components/Date"

/**
 * 按发布时间从早到晚排序（Quartz 默认是「最新在前」的倒序）。
 * 本站按年+月浏览时希望越早发布的排在上面，故统一改为正序。
 * 排序只依赖日期，不依赖配置，因此用固定的全局配置对象即可。
 */
const sortConfig: QuartzConfig["configuration"] = {
  pageTitle: "且慢长赢知识库",
  pageTitleSuffix: " - ETF拯救世界图文帖",
  enableSPA: false,
  enablePopovers: true,
  analytics: null,
  locale: "zh-CN",
  baseUrl: "TangMisaka23001.github.io/qieman-finance",
  ignorePatterns: [],
  defaultDateType: "modified",
  theme: {
    fontOrigin: "local",
    cdnCaching: true,
    typography: {
      header: "Schibsted Grotesk",
      body: "Source Sans Pro",
      code: "IBM Plex Mono",
    },
    colors: {
      lightMode: {
        light: "#faf8f8",
        lightgray: "#e5e5e5",
        gray: "#b8b8b8",
        darkgray: "#4e4e4e",
        dark: "#2b2b2b",
        secondary: "#284b63",
        tertiary: "#84a59d",
        highlight: "rgba(143, 159, 169, 0.15)",
        textHighlight: "#fff23688",
      },
      darkMode: {
        light: "#161618",
        lightgray: "#393639",
        gray: "#646464",
        darkgray: "#d4d4d4",
        dark: "#ebebec",
        secondary: "#7b97aa",
        tertiary: "#84a59d",
        highlight: "rgba(143, 159, 169, 0.15)",
        textHighlight: "#b3aa0288",
      },
    },
  },
}

const byDateAscending = (cfg: QuartzConfig["configuration"]) => {
  return (f1: QuartzPluginData, f2: QuartzPluginData) => {
    if (f1.dates && f2.dates) {
      return getDate(cfg, f1)!.getTime() - getDate(cfg, f2)!.getTime()
    } else if (f1.dates && !f2.dates) {
      return -1
    } else if (!f1.dates && f2.dates) {
      return 1
    }
    const f1Title = f1.frontmatter?.title.toLowerCase() ?? ""
    const f2Title = f2.frontmatter?.title.toLowerCase() ?? ""
    return f1Title.localeCompare(f2Title)
  }
}

/**
 * Quartz 4 Configuration —— 且慢社区「ETF拯救世界」图文帖知识库
 *
 * 内容来源：仓库内的 data/markdown（原文）、逐篇摘要（抽取结果）与三份报告，
 * 由 tools/build-site.mjs 整理成 content/ 目录后交给 Quartz 构建。
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "且慢长赢知识库",
    pageTitleSuffix: " - ETF拯救世界图文帖",
    enableSPA: false,
    enablePopovers: true,
    analytics: null,
    locale: "zh-CN",
    baseUrl: "TangMisaka23001.github.io/qieman-finance",
    ignorePatterns: [
      "private",
      "templates",
      ".obsidian",
      "data",
      "extracted",
      "逐篇摘要",
      "public",
      "node_modules",
      "quartz",
    ],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "local",
      cdnCaching: true,
      typography: {
        header: "Schibsted Grotesk",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#faf8f8",
          lightgray: "#e5e5e5",
          gray: "#b8b8b8",
          darkgray: "#4e4e4e",
          dark: "#2b2b2b",
          secondary: "#284b63",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#161618",
          lightgray: "#393639",
          gray: "#646464",
          darkgray: "#d4d4d4",
          dark: "#ebebec",
          secondary: "#7b97aa",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage({ sort: byDateAscending(sortConfig) }),
      Plugin.TagPage({ sort: byDateAscending(sortConfig) }),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // 自定义社交图需要 satori + 完整中文字体，构建耗时且非必需，故关闭
      // Plugin.CustomOgImages(),
    ],
  },
}

export default config
