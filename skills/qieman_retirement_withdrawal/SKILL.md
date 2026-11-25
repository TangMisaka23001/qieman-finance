# Retirement planning and withdrawal

## When to use

- Use this skill when the user asks how much they need to retire, how much they can withdraw each year, or how to test whether their money will last.
- Use it when the user asks about the 4 percent rule, a dynamic withdrawal guardrail, a cash reserve, or a FIRE plan.
- Use it when the user wants to turn a lump sum, a dividend stream, or a trading cash flow into a living budget.
- Do not use it to promise a safe withdrawal rate, to give a retirement date, or to replace a licensed financial planner.

## Source grounding

- Ground every answer in the qieman-finance repository, which holds 645 posts by ETF拯救世界 from 2025-10-22 to 2026-11-10.
- Read section 15 of 核心思想综合报告.md first for the 13 posts themed 财务自由与退休规划, section 12 for the 16 posts themed 个人财富管理与消费, and section 13 for the 14 posts themed 财富的节制与自由.
- Check individual posts in 文章核心信息.jsonl by filtering theme to 财务自由与退休规划 or 个人财富管理与消费, and open 逐篇摘要/<id>.md when a claim needs its original wording.
- Say plainly that the model defaults in the corpus, such as 3.5 percent inflation and 5 percent expected return, are tool defaults, not forecasts.

## Turn retirement into a cash flow model

- Treat retirement as a cash flow question, not as a single target number, and start from current assets, real annual spending, inflation, and expected return.
- Work backward from the withdrawal to the required capital, and use 20 to 25 times annual spending as the steady capital range the synthesis records.
- Count only liquid assets in the first layer, such as cash, stocks, bonds, and gold, and leave illiquid or uncertain assets out of that layer.
- Update the model with the latest assets and the latest spending, and test it year by year for the risk of running out.
- Tell the user to learn the model first and then adjust it with a spreadsheet or a calculator for their own case, rather than treating one result as a certain answer.

## Use the 4 percent rule with guardrails

- Use a fixed 4 percent withdrawal as a baseline only, and run a dynamic guardrail case beside it.
- Warn that a fixed withdrawal in a bear market eats into capital, and that the 4 percent rule is not a guarantee.
- Let the guardrail raise or lower the withdrawal as assets rise or fall, so living costs stay smoother across bull and bear markets.
- Show the example from the corpus as an example only. With 1 million yuan of assets at the start of the year, a 4 percent base rate gives a 40 thousand yuan base withdrawal.
- Keep at least three years of withdrawal money in cash like assets, and deduct large one off spending in full before you test sustainability.
- Do not count unrealized capital gains as living money. Count dividends and grid trading cash flow in the budget only when they are actually received.

## Build capital before withdrawing it

- Ask the user to build income and capital first when investable assets are low, and to hold an emergency fund before long term allocation.
- Tell the user that earning money and keeping money are different skills, and that avoiding a permanent loss comes before chasing a high return.
- Split money by horizon, using one to three years for trading money and five years or more for long term money, as the synthesis records it.
- Check asset quality, the dividend or income stream, the holding size, and the permanent loss risk before any order.
- Use a withdrawal calculator to balance saving, experience, and investing, and do not let extreme saving damage the life the money is meant to support.

## Define enough and review it

- Ask the user to write down their own definition of enough across health, relationships, finances, and free time, and use that definition to set the spending target.
- Tell the user that wealth serves health, relationships, and present life, not endless accumulation, and that freedom means control over time.
- Set a stop rule for expansion, and a rule for refusing a new investment, before the user feels pressure to keep growing.
- Update the model after a bonus, a new income, or a large expense, and adjust the withdrawal to the actual spending that followed.
- Review the assumptions at each update, including return, inflation, and outside income, and show how the result moves when each one changes.

## Present the result

- Present the inputs, the 20 to 25 times capital range, the fixed 4 percent case, and the dynamic guardrail case side by side.
- Present the cash reserve in years and in money terms, the large expenses deducted, and the income streams counted.
- End with the update date, the next review trigger, and the assumption that would change the withdrawal first.
- Add one line that this is a summary of the author's method from the cited posts, not personalized investment advice, and that a licensed planner should check a real retirement decision.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for reading the qieman-finance repository, its report, its JSONL index, and its per article summaries.
- [Financial Planning](/opt/muse/skills/financial-planning/SKILL.md) for building a budget and testing whether a planned withdrawal fits the user's cash flow.
- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.
- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [qieman-finance on GitHub](https://github.com/TangMisaka23001/qieman-finance) for the report, the article index, and the per article summaries.
- [qieman-finance site](https://TangMisaka23001.github.io/qieman-finance) for browsing the same content as a site.
