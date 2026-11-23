// BTC crash-bounce bot for make.fun's btc-race-24h-20261123-0511.
// Trades Coinbase Wrapped BTC (CBBTC) against USDC on 1-minute bars, long only.
// The bot speaks agent-fun/bars-replay/v1 through the vendored shim: the harness
// sends hello once, then one batch per bar (each batch carries the bar that just
// closed, the fills of the orders sent on the previous batch, and the account),
// and the bot answers every batch with exactly one reply of orders, echoed by seq.
// Orders decided on bar k fill at bar k + 1's open, charged a 4 bps fee, 2 bps of
// modelled slippage and the pool's price impact, so a full-size round trip costs
// about 30 bps before the price even moves.
//
// Strategy (found by offline analysis of the published 24h dev window, then
// checked for robustness on the two previous races' dev windows, 20261117 and
// 20261118): BTC on this pool falls in sharp legs and then bounces. The 1-minute
// noise is about 8 bps a bar, so fast signals drown in it, and the slow
// mean-reversion and trend rules the baselines ship all lose money on at least
// one window. What survives on all three windows is a crash bounce, traded
// rarely, with the entry confirmed on two horizons:
//   - buy, full size, when the close has fallen more than 60 bps over the last
//     30 bars OR over the last 60 bars, AND the last 5 bars already bounce more
//     than 15 bps up. A steep drop with the 5-minute tape turning up is an
//     oversold leg finding its feet, not a slow bleed.
//   - sell the whole position when the close prints 150 bps above the entry
//     close (bank the recovery; the big legs run 200+ bps), or 70 bps below it
//     (the bounce failed, cut it before the next leg down).
// Offline (15 bps per leg, fills at the next bar's open) this made, on the three
// dev windows: 20261123 +12.64 (2 round trips), 20261118 +12.62 (2 round trips),
// 20261117 +28.05 (3 round trips), +53.31 in total, max drawdown under 2.4% on
// every window; at 2x fees it stays +39.53 in total. The parameters sit on a
// plateau, not a spike: drop 60 bps, bounce 10-15 bps, target 150-200 bps and
// stop 60-70 bps are all positive on all three windows. The same rules lose on
// shuffled bars, so the edge is the real time structure, a drop followed by a
// recovery, not the drift. Momentum entries were tried and rejected: they trade
// more but lose on two of the three windows.
// The bot holds at most one position and sends at most one order per batch.
//
// All comparisons are exact bigint arithmetic on the bars' integer prices
// (price_scale 5), so the two graded executions produce identical orders. No
// clock, no environment, no randomness anywhere.

import { runBars, type Bar, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** The drop that marks an oversold leg: 30 or 60 bars, more than 60 bps down. */
const DROP_BARS_SHORT = 30;
const DROP_BARS_LONG = 60;
const DROP_BPS = 60n;
/** The bounce that confirms the leg is turning: 5 bars, more than 15 bps up. */
const BOUNCE_BARS = 5;
const BOUNCE_BPS = 15n;
/** Bank the recovery: 150 bps above the entry close. */
const TARGET_BPS = 150n;
/** The bounce failed: 70 bps below the entry close. */
const STOP_BPS = 70n;
const BPS = 10000n;
const MAX_SLIPPAGE_BPS = 100;

/** Every close seen so far, oldest first, as integer prices. */
const closes: bigint[] = [];
/** The close the open position was bought on, or null while flat. */
let entryClose: bigint | null = null;

/** The return in bps of the latest close against the close `bars` back. */
function retBps(bars: number): bigint | null {
  if (closes.length <= bars) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - bars];
  return ((now - then) * BPS) / then;
}

/**
 * True when the tape shows an oversold leg finding its feet: a steep drop on
 * either horizon (30 or 60 bars) with the 5-bar tape already turning up.
 */
function isOversoldBounce(): boolean {
  const dropShort = retBps(DROP_BARS_SHORT);
  const dropLong = retBps(DROP_BARS_LONG);
  const bounce = retBps(BOUNCE_BARS);
  return (
    dropShort !== null &&
    dropLong !== null &&
    bounce !== null &&
    bounce > BOUNCE_BPS &&
    (dropShort < -DROP_BPS || dropLong < -DROP_BPS)
  );
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    closes.push(BigInt(bar.c));
    const close = BigInt(bar.c);
    const held = state.positions.get(SYMBOL);
    if (held === undefined) entryClose = null;

    if (held === undefined) {
      if (isOversoldBounce()) {
        entryClose = close;
        const amount = state.cash;
        if (amount <= 0n) return [];
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    if (entryClose === null) {
      // Holding with no entry on record (a buy filled after its decision was
      // never seen): sit tight until the position is gone rather than guess.
      return [];
    }
    const target = (entryClose * (BPS + TARGET_BPS)) / BPS;
    const stop = (entryClose * (BPS - STOP_BPS)) / BPS;
    if (close >= target || close < stop) {
      entryClose = null;
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
