# Interactive loading hardening

## Baseline

Local real API, Yahoo mode, 2026-09-10. Base main:
`64fe250055f7e8cc11e3052f33061763458da59a`.
One new API process; endpoints measured sequentially (shared upstream credentials
and disk/provider caches may already be warm). HTTP 200 in every sample.
These are observations, not CI requirements or guarantees about live sources.

| Endpoint | Cold seconds | Second | Third | Warm p50 (5 samples) | First usable | Completion | Data |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Canada earnings | 2.0896 | .0281 | .0261 | .0219 | 2.1053 | 39.2862 | partial, 2501 dates |
| Composite earnings | 2.0125 | .0096 | .0297 | .0076 | 2.0138 | 4.1184 | partial, 200 dates |
| CNQ fundamentals | 5.2780 | .0079 | .0077 | .0074 | 5.2784 | 5.3310 | partial, 13 non-null metrics |

Completion is observed by polling every two seconds, not an exact internal source
duration. The baseline fundamentals endpoint has no separate deep-refresh status.
Warm measurements follow completion. No events or values were fabricated.

## After

Same protocol on a new API process, Yahoo mode. The full browser test suite was
running concurrently on this Windows workstation; elapsed timings include that
local contention. HTTP 200 throughout.

| Endpoint | Cold seconds | Second | Third | Warm p50 | First usable | Completion | Initial / final data |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Canada earnings | 2.2140 | .0904 | .0440 | .0718 | 2.2148 | 64.0878 | 53 dates explicitly TSX 60 temporary / 2487 dates, partial |
| Composite earnings | .8340 | .0234 | .0157 | .0187 | .8393 | 6.9939 | 200 partial / 200 available |
| CNQ fundamentals | .0843 | .1085 | .0122 | .0177 | .0850 | 6.4566 | 37 / 37 non-null metrics, partial |

The CNQ initial response included analyst consensus independently of statement
providers. The final cold targets were met in this sample, not a guaranteed SLA;
provider caches can survive API process restarts. Intermediate runs measured CNQ
at 3.1202s and 8.2888s. The latter exposed synchronous HTTP client setup and
document parsing blocking the event loop; those operations now run in threads.
Intermediate Canada completion was 71.6281s and 67.5211s. Live event counts vary.
Canada's final deep completion was slower than baseline, not faster. The improvement
is a bounded interactive path under a slow directory/consensus, not a claim that
all upstream requests became faster. Deterministic tests enforce that separation.

## Architecture

- Canadian listing identity cache: 6h fresh / 24h stale, bounded scan, single flight,
  60s failure cooldown. Event quotes refresh separately every 15 minutes.
- Cold Canada explicitly uses available Composite coverage or TSX 60 warm-up;
  the full directory replaces it when ready. Published dates are stored before
  consensus enrichment. No estimates or dates are inferred.
- Fundamentals: 2.5s fast provider budget, independent lightweight analyst fallback,
  20s deep budget; individual official providers have 6s deadlines. HTTP overhead
  and event-loop scheduling remain visible in the measured end-to-end time.
- SEC/issuer HTTP client setup, SEC JSON/period parsing and issuer document parsing
  are offloaded from the event loop so source deadlines can actually fire.
- Last-good metrics, analysts, statements, estimates and events are retained per
  section, with stale marking; no implicit currency conversions.
- Web transport: total deadline including retry delay and body download, one GET
  retry by default; mutations require explicit idempotency to retry.
- Today lanes are locally owned single flights; key changes/unmount cancel only
  those controllers. Hidden pages do not poll; visibility return is controlled.
- Focus and earnings refresh preserve usable snapshots; client fallback responses
  propagate their stale header into snapshot metadata.
