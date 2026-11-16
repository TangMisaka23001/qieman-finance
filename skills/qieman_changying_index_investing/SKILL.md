# Changying index investing

## When to use

- Use this skill when the user asks how to build or review a long term index portfolio in the Changying style, how to split core and satellite holdings, or whether an index, dividend or sector product fits as a core holding.
- Use it when the user asks about following the Changying plan, copying a public index plan, or judging a follow along product.
- Do not use it for a single stock pick, a short term trade, or a request for a buy or sell call on one named fund.

## Source grounding

- Ground every answer in the qieman-finance repository, which holds 645 posts by ETF拯救世界, the Changying plan manager, from 2025-10-22 to 2026-11-10.
- Read section 2 of 核心思想综合报告.md first for the cross article synthesis of the 86 posts themed 指数投资与长赢策略.
- Check individual posts in 文章核心信息.jsonl by filtering theme to 指数投资与长赢策略, and open 逐篇摘要/<id>.md when a claim needs its original wording.
- Treat the report as a summary of one author's method, not as market fact. Quote its numbers only with their source post id.
- Say plainly when a point comes from the synthesis and has no single post behind it.

## Build the core satellite split

- Ask for the money horizon of each sum before you suggest any split, and keep short term money out of long cycle assets.
- Put broad based indexes and dividend low volatility products in the core, and keep sector and theme products as small satellites.
- Ask the user to state a satellite cap in percent before you discuss any satellite name, and refuse to size a satellite from its recent return alone.
- Check each candidate against valuation direction, technical position, the gap in the current allocation, and the purpose of the trade, and record all four checks before you call it a fit.
- Treat momentum and grid trading as limited timing aids, never as a replacement for position and risk discipline.
- Remind the user that an index rising does not mean most of its constituents rose, and that buying an index is not a guaranteed profit.

## Use valuation and profit taking

- Use valuation to set direction, and use low level staged buying and high level staged selling to carry it out.
- Keep cash and defensive holdings in the plan so a drawdown can be met without a forced sale.
- Put profit taking and psychological tolerance ahead of guessing a top or a bottom.
- Tell the user that a bottom is hard to pinpoint, and that buying a sharp dip can stay unprofitable for years.
- Do not copy another person's thresholds. A level that worked for one plan, such as a moving average line in one post, is that plan's parameter, not a universal rule.

## Judge a follow along product

- Judge a follow along product by the share of followers who actually made money, not by the product net value reaching a new high.
- Ask for the fee, the entry and exit timing of the followers, and a repeatable record before you praise a plan.
- Note that the Changying synthesis records the 150 plan net value hitting a new high while the profitable follower share fell from 99.13 percent to 92 percent, so the two numbers must be read together.
- Tell the user that following a plan does not replace independent judgment, and that different markets and personal goals change the right answer.
- Keep the A share long holding experience in view. The synthesis says it has been weak, so do not promise a smooth long term ride.

## Present the result

- Present the plan as core percent, satellite percent, and cash percent, with the horizon and the valuation check for each part.
- List the staged buy and sell rules in plain steps, with the trigger, the size, and the rebuy condition for each step.
- End with what would make you change the plan, such as a valuation extreme, a horizon change, or a cash need, and what would not, such as one day of price movement.
- Add one line that this is a summary of the Changying author's method from the cited posts, not personalized investment advice.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for reading the qieman-finance repository, its report, its JSONL index, and its per article summaries.
- [Financial Planning](/opt/muse/skills/financial-planning/SKILL.md) for building a budget and testing whether a planned allocation fits the user's cash flow.
- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.
- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [qieman-finance on GitHub](https://github.com/TangMisaka23001/qieman-finance) for the report, the article index, and the per article summaries.
- [qieman-finance site](https://TangMisaka23001.github.io/qieman-finance) for browsing the same content as a site.
