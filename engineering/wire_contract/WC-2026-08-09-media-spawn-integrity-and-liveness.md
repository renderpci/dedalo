# WC-2026-08-09-media-spawn-integrity-and-liveness — a killed media command is a failure, and a transcode is capped on SILENCE, not on time

- **Date:** 2026-08-09 (audit `audits/2026-08_oh1_beta/REPORT.md` blocker **B2**,
  remediation wave 2).
- **Decision:** no DEC; this is B2's remediation. The `engineering/MEDIA_SPEC.md`
  §4.2/§7.C/§9 moov-relocation requirement is the parity side of it.

## Shape before (PHP)

`core/media_engine/class.Ffmpeg.php` built a shell string, wrote it into a
self-deleting `.sh` and ran it **detached** (`:786-793`). Three consequences, all
of them the fossil this entry replaces:

1. **No timeout of any kind.** A transcode ran until it finished or the box died.
   A wedged ffmpeg was a process nobody ever reaped.
2. **No outcome check on a kill.** The exit status of a detached job was not
   examined; whatever landed at the target path was the derivative.
3. **One moov route.** `qt-faststart` was run unconditionally after pass 2
   (`:782`); on an install without that binary the step simply did not happen and
   nothing recorded that it had not.

## Shape after (TS)

1. **A killed command is a hard failure.** `SpawnResult.ok` (exit 0, no signal,
   no timeout) is the single truth and `assertSpawnOk` is the gate. Nothing is
   published unless the producing command actually succeeded, and every av tier is
   staged through `writeAtomically`, so a failed encode leaves the PREVIOUS
   derivative byte-identical instead of replacing it with a truncated one.
2. **The cap measures INACTIVITY, not elapsed time.** A file-producing spawn runs
   under `idleTimeoutMs` (`engine/ffmpeg.ts PRODUCER_IDLE_TIMEOUT_MS`, 10 min of
   total silence); every ffmpeg run carries `-progress pipe:1` so a working
   process is never silent. A wall-clock budget stays available
   (`SpawnOptions.timeoutMs`, default 10 min) and is used ONLY by bounded
   commands — `ffprobe`, `identify`, `pdfinfo`. The two are mutually exclusive;
   passing both throws.
3. **A second moov route.** When `DEDALO_AV_FASTSTART_PATH` names a binary that
   is not installed, the relocation is done by `ffmpeg -c copy -movflags
   +faststart` — the same result by the tool that just did the encode. When
   BOTH routes fail, a derivative encode DEGRADES (the file lands, moov at the
   end) and the reason is surfaced on the outcome, in the job payload
   (`faststart_error`) and on `console.error`; `conform_headers`, where the
   relocation IS the operator's request, fails loudly BEFORE anything is touched.

## Reason

Divergence 1 is the blocker itself: PHP's silence let a SIGKILLed pass rename a
partial, moov-less file over a master derivative and index it `file_exist:true`
while the job reported done. In a heritage archive that is unrecoverable data
loss with nothing anywhere saying so.

Divergence 2 exists because divergence 1 alone would have been a different
blocker. This engine runs jobs IN PROCESS under a 3-lane cap, so it cannot adopt
PHP's "no cap ever" — a wedged encode would hold a lane forever. But the content
is hour-long oral-history interviews, and a two-pass x264 encode of one
legitimately outruns any constant, so making the pre-existing 10-minute
WALL-CLOCK cap a hard failure would have converted silent corruption into
guaranteed failure for exactly the recordings B2 was measured on. An inactivity
window separates the two cases the constant cannot: a live encode of any duration
passes, a wedge of any duration dies. It is strictly closer to PHP than a budget
is — it never kills work that is progressing.

Divergence 3 restores PHP's OUTPUT shape (moov-first, progressively streamable)
on installs PHP would have silently skipped. Nothing on the wire or on disk
differs from what PHP produced when its one route was present.

## Gate reconciliation

- `test/unit/media_encode_integrity_native.test.ts` — drives every case through
  the spawn seam with fake binaries (killed, non-zero, self-killed, exit-0-empty,
  chatty-but-long, no qt-faststart, neither route): a timed-out encode rejects and
  the previous derivative stays byte-identical; a LONG but live process is NOT
  killed by an inactivity cap it outlives several times over; both faststart
  routes are exercised, including the degraded one.
- `test/unit/media_writer_discipline_tripwire.test.ts` invariant 7 — the source
  gate, in two halves. **7a**: every media declaration that runs an external binary
  must consult the outcome (`assertSpawnOk` / `.ok` / a destructured `ok` /
  `result.signal !== null`) or delegate the `SpawnResult` to a declaration this
  gate also scans — a delegate whose name is not in `SPAWN_RUNNER_NAMES` is a dead
  end and fails. **7b, no exemptions**: no scanned file may NEGATE the kill fact
  (`!r.timedOut`, `!r.signal`, `r.timedOut === false`, `r.signal === null`).
  `.exitCode` alone does not count — bun resolves a signalled child as 128+n, which
  is the mechanism that made B2 invisible — and neither does `if (r.timedOut)`,
  because `timedOut` is `capExpired && signal !== null`, a strict SUBSET of the
  kills: a runner branching on it alone swallows every kill we did not order.
- `test/unit/media_kill_integrity_native.test.ts` — the BEHAVIOURAL twin of that
  source gate, because a source scan proves the question is ASKED, never what the
  answer is, and the answer is the defect. One fake `magick` (serving both the
  `identify` and the writer roles, as the real binary does) prints a plausible
  PARTIAL report and then `kill -9`s itself. It pins the discriminator first — a
  self-SIGKILLed child reports `signal !== null` with `timedOut FALSE`, so every
  case is a kill the old `timedOut` branch could not see — then asserts each
  declaration's own contracted answer: `probeImageSource` THROWS rather than
  reading a truncated 3-scene report as a single-scene source; `probeMetaChannels`
  returns the documented `unknown` (`hasAlpha: true`) rather than the
  `{0, hasAlpha: false}` a cut `srgb  4.` parses to; `probeContentSpread` returns
  null rather than a number it never measured; and `runMagickTo` refuses a killed
  conversion whose partial output passes BOTH post-conditions (exists, non-empty,
  pings as one image). Every case carries a POLARITY CONTROL whose stdout is
  byte-identical but which exits cleanly and is still answered — without it the
  gate would also pass against an engine that had merely become strict about short
  reports, which is a refusal the oracle never made.
- **No re-harvest.** Nothing here changes a JSON response body: the frozen
  fixture store is untouched. The only client-visible surface is the av job
  payload, which GAINED an optional `faststart_error` field (null when sound); no
  fixture asserts it.
