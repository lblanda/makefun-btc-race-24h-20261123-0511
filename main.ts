// Crash-bounce BTC bot — make.fun btc-race-24h-20261123-0511.
// Trades Coinbase Wrapped BTC (CBBTC) vs USDC on 1-minute bars, long only,
// starting from 1,000 USDC of paper money. The harness replays one bar per
// batch and the bot answers each batch with its orders; an order decided on
// bar k fills at bar k+1's open, and a full-size round trip costs roughly
// 30 bps in fees, slippage and price impact before the price moves at all.
//
// What the tape does on this pool: BTC drops in sharp legs and then snaps
// back. The one-minute noise is about 8 bps a bar, so anything fast drowns
// in it, and the slow mean-reversion and trend rules in the baselines all
// lose money on at least one of the three published dev windows. The rule
// that survives on all three windows is a crash bounce, traded rarely, with
// the entry confirmed on two horizons at once:
//   - ENTER, full size, when the close is down more than 60 bps over the
//     last 30 bars or over the last 60 bars, AND the last 5 bars already
//     bounce more than 15 bps upward. A steep drop whose 5-minute tape is
//     turning up is an oversold leg finding its feet, not a slow bleed.
//   - EXIT the whole position when the close prints 150 bps above the entry
//     close (bank the recovery; the big legs run 200+ bps), or 70 bps below
//     it (the bounce failed — cut it before the next leg down).
// The parameters sit on a plateau, not a spike: drop 60 bps, bounce 10-15
// bps, target 150-200 bps and stop 60-70 bps are all positive on every
// window, and the same rule loses on shuffled bars, so the edge is the real
// time structure — a drop followed by a recovery — not the drift.
//
// At most one position is ever held and at most one order is sent per batch.
// Every comparison is exact bigint arithmetic on the bars' integer prices
// (price_scale 5). There is no clock, no environment access and no
// randomness anywhere, so the two graded executions produce identical orders.

import {
  runBars,
  type Bar,
  type BarsState,
  type OrderInput,
} from './vendor/makefun-bars.ts';

const ASSET = 'CBBTC';
const SCALE = 10000n; // one basis point is 1/10000
const SLIPPAGE_CAP_BPS = 100;

// Entry: how far the close must have fallen, and over which lookbacks.
const FALL_BPS = 60n;
const FALL_WINDOWS = [30, 60];
// Entry confirmation: how far the close must have bounced over the last bars.
const BOUNCE_BPS = 15n;
const BOUNCE_WINDOW = 5;
// Exit: bank the recovery, or cut the failed bounce.
const WIN_BPS = 150n;
const LOSE_BPS = 70n;

/** Closes seen so far, oldest first, as integer prices. */
const history: bigint[] = [];
/** Close the open position was bought at; null while flat. */
let boughtAt: bigint | null = null;

/** Basis-point move of the latest close vs the close `lookback` bars ago. */
function moveBps(lookback: number): bigint | null {
  if (history.length <= lookback) return null;
  const latest = history[history.length - 1];
  const earlier = history[history.length - 1 - lookback];
  return ((latest - earlier) * SCALE) / earlier;
}

/** True when a steep fall on either horizon is already bouncing back. */
function crashBounceNow(): boolean {
  const bounce = moveBps(BOUNCE_WINDOW);
  if (bounce === null || bounce <= BOUNCE_BPS) return false;
  return FALL_WINDOWS.some((w) => {
    const fall = moveBps(w);
    return fall !== null && fall < -FALL_BPS;
  });
}

/** True when the open position, bought at `entry`, should be closed now. */
function shouldExit(entry: bigint, close: bigint): boolean {
  const bankAt = (entry * (SCALE + WIN_BPS)) / SCALE;
  const cutAt = (entry * (SCALE - LOSE_BPS)) / SCALE;
  return close >= bankAt || close < cutAt;
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === ASSET);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    history.push(close);

    const held = state.positions.get(ASSET);
    if (held === undefined) boughtAt = null;

    if (held === undefined) {
      if (!crashBounceNow()) return [];
      const cash = state.cash;
      if (cash <= 0n) return [];
      boughtAt = close;
      return [
        {
          side: 'buy',
          symbol: ASSET,
          notional_quote_units: cash,
          max_slippage_bps: SLIPPAGE_CAP_BPS,
        },
      ];
    }

    // Holding with no entry on record (a buy whose decision batch was never
    // seen): sit tight until the position is gone rather than guess an exit.
    if (boughtAt === null) return [];

    if (shouldExit(boughtAt, close)) {
      boughtAt = null;
      return [
        {
          side: 'sell',
          symbol: ASSET,
          qty: held.qty,
          max_slippage_bps: SLIPPAGE_CAP_BPS,
        },
      ];
    }
    return [];
  },
});
