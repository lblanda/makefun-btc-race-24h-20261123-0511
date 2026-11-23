# makefun-btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/lblanda/makefun-btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/lblanda/makefun-btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A BTC trading bot that races Coinbase Wrapped BTC (cbBTC) live for 24 hours on make.fun, for $50 in USDC. It trades 1-minute on-chain bars with $1,000 of paper money, long only: it buys a crash bounce — a close that fell more than 60 bps over 30 or 60 bars while the last 5 bars already bounce more than 15 bps up — and sells at +150 bps above the entry close, or cuts at −70 bps when the bounce fails. Offline, on the published dev window, it made +$12.64 net (2 round trips, max drawdown 1.6%); the same rules made +$12.62 on the 20261118 dev window and +$28.05 on the 20261117 dev window, +$53.31 in total, and stay positive at 2x fees. All comparisons are exact integer arithmetic on the bars' integer prices, so the two graded executions produce identical orders.

## Run it

```sh
node cli/makefun.mjs grade-local --kit btc-race-24h-20261123-0511-kit --bot . --driver process
```

The grader runs `node /bot/main.ts` with this directory mounted at `/bot`; `vendor/makefun-bars.ts` is the kit's bars-replay/v1 shim, vendored as the rules allow.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3zwarjv0&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
