# Position management and timing discipline

## When to use

- Use this skill when the user asks how much to buy, when to add or trim, how to set a buy range or a stop, or how to run a grid or a staged trade.
- Use it when the user wants to chase a rising product, buy a dip, or copy a trading level they saw in a post.
- Do not use it to predict the next top or bottom, or to give a buy or sell call on one named fund.

## Source grounding

- Ground every answer in the qieman-finance repository, which holds 645 posts by ETF拯救世界 from 2025-10-22 to 2026-11-10.
- Read section 1 of 核心思想综合报告.md first for the cross article synthesis of the 121 posts themed 仓位管理与择时纪律.
- Read section 11 for the 17 posts themed 技术分析与盘面观察, and treat technical levels as auxiliary only.
- Check individual posts in 文章核心信息.jsonl by filtering theme to 仓位管理与择时纪律, and open 逐篇摘要/<id>.md when a claim needs its original wording.
- Say plainly when a level or a percent comes from one commenter or one plan, not from the whole corpus.

## Set the risk budget first

- Ask the user to write down the asset allocation, the maximum position, and the maximum loss they can bear before you discuss any timing.
- Refuse to set a buy point from a price chart alone when those three numbers are missing.
- Choose the product by value and quality first, and use valuation, momentum, technicals, and fund flow only to arrange the timing of staged entries, trims, profit taking, and rebuys.
- Tell the user that the method is a set of rules that can be followed for a full cycle, not a way to buy the exact bottom or sell the exact top.
- Warn the user that different plans can buy and sell the same product on the same day and both be right, because their missions and preset conditions differ.

## Separate core and trading holdings

- Split the holding into a core holding and a trading holding, and write separate buy ranges, target positions, profit taking rules, and rebuy conditions for each.
- Take profit on the trading holding while keeping the quality core holding, and say in advance how much of each you will keep.
- Add only inside a preset falling range, trim only in preset rising steps, and keep cash and bonds as a buffer in both cases.
- Pick a balanced mix the user can keep following for years, and do not let a breakout signal push the user into a chase buy.
- Keep leverage out of the plan. The synthesis warns against chasing, full position, and full margin, and against letting short term moves run the plan.

## Use tools only inside discipline

- Treat grid trading, regular investing, and moving averages as tools, and require a written trigger and a written exit for each one.
- Use a moving average or a support level as a staging aid, and update it as the cycle and the year change, because no level is a fixed iron bottom.
- Use the same adjusted price basis for every review, so dividends and splits do not create false gaps or distort a moving average.
- After a large rise, watch the next three days, and treat a retracement of more than half the rise as a sign the trend is unclear.
- Write the trigger price, the holding purpose, the position size, and the exit rule before the order, and execute only at the trigger.

## Guard against copied parameters

- Do not present another person's level as a universal rule. The synthesis flags the 850 line for medical indexes and a commenter's 23 percent ETF position as personal parameters.
- Do not present a grid sell point or a profit threshold from a post as a general target.
- Ask the user for their own maximum loss and their own holding period, and size every stage from those numbers.
- If the user insists on copying a level, show them the post it came from, name the plan it belonged to, and say what would break if their plan differs.

## Present the result

- Present the risk budget first, then the core and trading splits, then the staged buy and sell table with trigger, size, and rebuy condition for each row.
- List the cash and bond buffer as a percent, and state what happens when it is used up.
- End with the discipline check, namely what the user will do on a sharp fall, a sharp rise, and a long flat period, before any of them happens.
- Add one line that this is a summary of the author's method from the cited posts, not personalized investment advice.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for reading the qieman-finance repository, its report, its JSONL index, and its per article summaries.
- [Financial Planning](/opt/muse/skills/financial-planning/SKILL.md) for testing whether a planned position fits the user's cash flow and debt dates.
- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.
- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [qieman-finance on GitHub](https://github.com/TangMisaka23001/qieman-finance) for the report, the article index, and the per article summaries.
- [qieman-finance site](https://TangMisaka23001.github.io/qieman-finance) for browsing the same content as a site.
