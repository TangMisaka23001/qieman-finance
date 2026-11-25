# Valuation and risk identification

## When to use

- Use this skill when the user asks whether a market, sector, or index is cheap or expensive, whether a high valuation must fall, or whether a low valuation means a bottom.
- Use it when the user asks how to spot crowding, a bubble, or a wealth loss risk beyond a price fall.
- Do not use it to call a short term top or bottom, or to give a buy or sell call on one named product.

## Source grounding

- Ground every answer in the qieman-finance repository, which holds 645 posts by ETF拯救世界 from 2025-10-22 to 2026-11-10.
- Read section 3 of 核心思想综合报告.md first for the cross article synthesis of the 61 posts themed 估值与守财风险.
- Check individual posts in 文章核心信息.jsonl by filtering theme to 市场估值与风险识别, and open 逐篇摘要/<id>.md when a claim needs its original wording.
- Name the valuation gauge you used, the history you compared it with, and the date of the data, and say when the data is stale.
- Say plainly when a conclusion is the author's judgment rather than a measured fact.

## Treat valuation as a thermometer

- Treat historical valuation as a risk thermometer, not as a short term timing device.
- Tell the user that a low valuation does not mean an immediate bottom, and that a high valuation does not mean a certain fall.
- Use valuation to spot a relative low and an extreme high, and stop there. Do not stretch it into a date for a turn.
- Pair a high valuation with a crowding check. A high valuation plus crowded institutional holding calls for capital protection, diversification, and waiting, not for a leveraged bet either way.
- Put risk identification ahead of precise prediction, and control drawdown and permanent loss before you talk about return.

## Turn a valuation view into rules

- Convert every valuation view into a position cap, a staged buying rule, and a rebalancing rule, and write all three down.
- Refuse to leave a valuation view as a feeling. If it cannot be written as a cap or a stage, say it is not yet actionable.
- Reject chasing a high valuation crowded sector, and reject leverage and non standard products in the same answer.
- Prefer a long term holder's stance of controlling drawdown and making fewer big mistakes, even when the user expects a new high.
- Check the same view against a second gauge, such as a Shiller PE, a valuation percentile, or a bond yield comparison, and report when the gauges disagree.

## Check wealth loss beyond price

- Check wealth loss beyond investment return, including inflation eating cash, product losses and defaults, overspending, bad company, a failed marriage, and fraud.
- Tell the user that a bank deposit is not risk free in real terms, and that every investment product can lose money or default.
- Tell the user that a large inheritance does not guarantee lifelong comfort, and that the heir's ability to keep money matters more than the balance.
- Ask about the user's own money habits and transfer timing when they ask about passing wealth on, and do not copy one commenter's suggested age for transfer as a general rule.
- Run a regular check for inflation, product default risk, and fraud risk, and write the check as a dated list the user can repeat.

## Present the result

- Present the valuation reading, the crowding reading, and the risk reading as three separate lines, each with its gauge and its limit.
- Present the resulting position cap, staged buying plan, and rebalancing rule in the same answer, so the view and the action stay linked.
- State what would change the reading, such as a valuation percentile moving out of its extreme, and what would not, such as one week of price movement.
- Add one line that this is a summary of the author's method from the cited posts, not personalized investment advice.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for reading the qieman-finance repository, its report, its JSONL index, and its per article summaries.
- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.
- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [qieman-finance on GitHub](https://github.com/TangMisaka23001/qieman-finance) for the report, the article index, and the per article summaries.
- [qieman-finance site](https://TangMisaka23001.github.io/qieman-finance) for browsing the same content as a site.
