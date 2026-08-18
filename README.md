# Context Meter

Keeps threads in the smart zone, by tracking context against a limit you set
rather than the provider's full window.

## Why

A model's advertised context window is not its usable range. Quality falls off
long before the window fills: retrieval gets less reliable, facts in the middle
of a long thread get missed, and multi-step reasoning drifts. The window tells
you when the model will refuse. It does not tell you when the model stopped
doing its best work.

So a long thread has two zones:

- **The smart zone.** Short enough that the model holds the whole thread
  properly. Answers stay precise and it remembers what you told it earlier.
- **The dumb zone.** Still well inside the window, so nothing errors, but the
  model is quietly worse. This is the dangerous one, because there is no
  warning. You just get slower, vaguer work and blame the model.

The point of this plugin is to make that boundary visible, so you compact or
start a fresh thread on purpose, rather than noticing after the answers have
already got worse.

### Where the boundary sits

Published guidance clusters around **100k tokens** for the smart zone edge, with
a warning band above it:

| Source | Finding |
| --- | --- |
| [Chroma, *Context Rot*](https://www.trychroma.com/research/context-rot) (2025) | All 18 frontier models tested degrade as input grows, "often in surprising and non-uniform ways". No single safe threshold; degradation appears at every increment measured. |
| [Liu et al., *Lost in the Middle*](https://arxiv.org/abs/2307.03172) (2023) | Attention follows a U curve. Facts in the middle of a long context are missed far more often than facts at either end. |
| [Matt Pocock](https://finance.biggo.com/news/e7209c094224b09c) | Puts the smart zone at roughly 100k tokens, and calls a 1M window "effectively shipping more dumb zone" for reasoning work. |
| [Duncan Leung](https://duncanleung.com/blog/llm-smart-zone-dumb-zone-context-window-degradation/) | Smart below 100k, warn 100k to 200k, dumb above 200k. |

Two things matter more than the exact number:

1. **The thresholds are absolute, not a percentage.** A 1M model at 40% full is
   400k tokens deep and badly degraded. A 200k model at 40% is at 80k and fine.
   Same percentage, completely different quality. This is precisely why a bar
   that fills against the provider's window is misleading.
2. **The real edge moves** with the model and with how much the work leans on
   holding everything at once.

The default here is **150000**, which puts the amber warning at 112k, close to
the 100k figure the sources converge on, and turns red mid warning band. If you
want the colours to line up exactly with those bands instead, set it to 100k and
read amber as "approaching the edge" rather than "past it".

BB's built-in ring cannot do that job, for two reasons:

1. **It fills against the provider's window.** On a 1M model, 170k tokens reads
   as 17% full, a bar that looks almost empty at the exact moment you should be
   thinking about splitting the thread. It measures the wrong thing.
2. **It is hidden on phones.** The compact composer layout collapses the footer
   row that holds the ring, so on a narrow screen there is no number at all.

This plugin fixes the first problem everywhere and the second one as a
consequence of where it renders. It is just as useful on a desktop.

## What it shows

- `111k / 150k` with a bar filled to 74%.
- Muted below 75%, amber from 75%, red at 100% and above. The count keeps
  climbing past your limit, because the limit is a target and not a wall.
- A leading `~` when BB estimated the token count rather than reading it from
  the provider. Against a 1M window that error was noise. Against your working
  limit it is worth marking.
- Nothing at all when the thread has no usage yet, rather than a misleading
  `0k`. BB clears the value right after a compaction and restores it when the
  next turn ends.

Hover (or read the accessible label) for exact tokens, the limit, the model's
real window, and whether the value was estimated.

### The three states

The same thread at three points, all against a 150k limit:

- `125k / 150k`, amber, bar at 83%.
- `170k / 150k`, red, bar clamped at full while the count keeps climbing.
- `43k / 150k`, muted, bar at 29%, after a compaction.

The last one is the recovery case. The compaction cleared the count, the line
hid rather than showing a misleading `0k`, and it came back with the new number
as soon as the next turn ended.

## Install

```
bb plugin install github.com/Hazihell/bb-plugin-context-meter
```

## Configure

The limit defaults to 150000. Change it at any time, with no reload:

```
bb plugin config context-meter set softLimit 200k
```

Accepts `150000`, `150k`, or `1.5m`. Leave it blank to fall back to the
provider's full context window.

Pick your number by the work, not the model. Long refactors across many files
want a lower limit than a single focused question, because they lean harder on
the model holding everything at once. Do not raise it just because you switched
to a model with a bigger window: the evidence says the degradation point barely
moves.

## How it works

The backend reads `contextWindowUsage` from the thread timeline summary and
serves it over plugin RPC. It also subscribes to thread changes, and when a
turn reports new usage it re-reads the number and pushes it to the frontend, so
the line updates the moment a turn ends. A 30 second poll sits behind that as a
backstop.

The frontend registers a composer banner with `chrome: "bare"`. Banners render
above the composer box, outside the footer row that the compact layout hides,
which is why this one survives on a phone.

## Develop

```
npm install
bb plugin build
bb plugin install .
```

Then `bb plugin reload context-meter` after each edit, or `bb plugin dev .` to
watch.

## Licence

MIT
