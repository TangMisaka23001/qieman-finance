# Asset allocation and rebalancing

## When to use

- Use this skill when the user asks how to split money across stocks, bonds, cash, gold, and dividend products, how to rebalance, or how much dividend or gold to hold.
- Use it when the user asks about a bond duration choice, a cross market split, or a high low rebalancing rule.
- Do not use it to pick one fund, to time one market, or to give a buy or sell call on one named product.

## Source grounding

- Ground every answer in the qieman-finance repository, which holds 645 posts by ETF拯救世界 from 2025-10-22 to 2026-11-10.
- Read section 6 of 核心思想综合报告.md first for the 40 posts themed 股债配置与再平衡, section 5 for the 41 posts themed 红利策略的长期价值, and section 10 for the 17 posts themed 全球分散与分批配置.
- Check individual posts in 文章核心信息.jsonl by filtering theme to 资产配置与股债搭配, 红利策略与高股息, or 宏观策略与全球配置, and open 逐篇摘要/<id>.md when a claim needs its original wording.
- Label every number with its source post or synthesis section, and say when two posts in the corpus disagree on a weight.

## Start from the balance sheet

- Ask the user to list all assets, all liabilities due within three years, and monthly income and spending before you suggest any allocation.
- Build the allocation from that balance sheet, not from a market view, and keep short term liabilities out of long term assets.
- Split money by horizon first, using one to three years for trading money and five years or more for long term money, as the synthesis records it.
- Keep at least one year of household spending in cash like assets before you discuss adding risk, and say the amount in money terms, not only as a percent.
- Put broad based indexes at the core, spread across assets and markets, and refuse a plan that bets the whole portfolio on one product.

## Control drawdown before chasing return

- Put the first goal as cutting the bear market drawdown, and the second goal as keeping up with a bull market, because compounding depends more on losing less and recovering faster.
- Show the recovery math in the answer. A 50 percent fall needs a 100 percent rise to recover, and a 20 percent fall needs a 25 percent rise.
- Replace guessing a top or a bottom with high low rebalancing and staged trades, and write the preset thresholds before any trade.
- Use cash, bonds, diversification, and low cost as the joint buffer, and state the buffer size in the plan.
- Tell the user that full long term holding is hard to sustain, and that cross border investing adds quota, premium, tax, capacity, and compliance limits.

## Place bonds, gold, and dividends honestly

- Treat a long bond as a rate bet, and warn that longer duration means larger price swings. A modified duration near 30 years means a one percentage point rise in yield cuts the price by about 30 percent, as the synthesis records it.
- Prefer short bonds or a bond ladder for the stable part of the portfolio, and check duration before you add any bond product.
- Treat dividend products as cash flow and compounding tools, not as low volatility guarantees. Check real earnings, continuous dividends, cycle position, and return on equity for each holding, and do not buy on dividend yield alone.
- Use the synthesis dividend example only as an example, not as a target. One dividend fund set in the corpus showed PE 8.55, PB 0.815, and dividend yield 4.38 percent against a 10 year government bond yield of 1.8211 percent.
- Warn that dividend products fell more than 70 percent in 2008, close to the broad market, so they are not a certain hedge in a bear market or a rising rate period.
- Treat gold as insurance without its own cash flow, keep it small, and stress test it. The synthesis records a 60 percent drawdown from the peak at about 2200 dollars per ounce and a 50 percent drawdown at about 2800 dollars, with a 5 percent example weight.
- Do not present inflation protection as a promise that gold must win in the long run.

## Rebalance and review

- Set a rebalancing threshold for each holding, such as broad indexes, dividends, gold, and satellites, and write the buy and sell stages for each.
- Rebalance from high to low on the threshold, and do not wait for a market call to act.
- Slow new buying when rates rise or the style turns against a holding, and leave room for switching costs. The synthesis notes a switch should leave at least three points to cover redemption fees.
- Review the plan on a fixed cycle, check long bond duration, overseas quota and premium, and the gold stress test at each review, and record what changed.
- Note that the corpus does not agree on gold, bond, and dividend weights, and that some sample portfolios in it cover only about a year and a half, so present a weight as a choice with its trade off, not as a settled fact.

## Present the result

- Present the balance sheet summary, the core satellite structure, and the weight cap for each part in one table of plain lines.
- Present the rebalancing thresholds and the staged buy and sell rules beside each weight.
- End with the drawdown the plan is built to survive, the cash reserve behind it, and the review date.
- Add one line that this is a summary of the author's method from the cited posts, not personalized investment advice.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for reading the qieman-finance repository, its report, its JSONL index, and its per article summaries.
- [Financial Planning](/opt/muse/skills/financial-planning/SKILL.md) for building a budget and testing whether a planned allocation fits the user's cash flow.
- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.
- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [qieman-finance on GitHub](https://github.com/TangMisaka23001/qieman-finance) for the report, the article index, and the per article summaries.
- [qieman-finance site](https://TangMisaka23001.github.io/qieman-finance) for browsing the same content as a site.
