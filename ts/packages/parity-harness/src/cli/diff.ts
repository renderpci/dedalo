#!/usr/bin/env bun
/**
 * Diff golden masters against a candidate engine (or another capture dir).
 *
 *   bun run diff <goldenDir> <candidate>
 *
 * <candidate> is either:
 *   - a URL  → each golden's RQO is replayed against it and the response diffed
 *              (use this to diff the TS engine, or PHP-vs-PHP for a determinism
 *              baseline — the Phase 0 milestone);
 *   - a dir  → <label>.json GoldenMaster files are loaded and diffed pairwise.
 *
 * Exits non-zero if any case diverges (after volatile-field redaction), so it can
 * gate CI.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureResponse, type CaptureConfig } from '../capture_client.ts';
import { diffJson, formatDiffReport } from '../differ.ts';
import type { GoldenMaster } from '../index.ts';

async function loadGolden(dir: string, label: string): Promise<GoldenMaster | null> {
  const file = Bun.file(join(dir, `${label}.json`));
  return (await file.exists()) ? ((await file.json()) as GoldenMaster) : null;
}

async function candidateBytes(
  candidate: string,
  golden: GoldenMaster,
): Promise<string | null> {
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    const cfg: CaptureConfig = { apiUrl: candidate };
    if (process.env.DEDALO_SESSION_COOKIE) cfg.cookie = process.env.DEDALO_SESSION_COOKIE;
    if (process.env.DEDALO_CSRF_TOKEN) cfg.csrfToken = process.env.DEDALO_CSRF_TOKEN;
    const res = await captureResponse(cfg, golden.rqo);
    return res.rawBytes;
  }
  const other = await loadGolden(candidate, golden.label);
  return other ? other.responseBytes : null;
}

async function main(): Promise<number> {
  const goldenDir = process.argv[2];
  const candidate = process.argv[3];
  if (!goldenDir || !candidate) {
    console.error('usage: bun run diff <goldenDir> <candidateUrlOrDir>');
    return 2;
  }
  const files = (await readdir(goldenDir)).filter((f) => f.endsWith('.json'));
  let failures = 0;
  for (const f of files) {
    const label = f.replace(/\.json$/, '');
    const golden = await loadGolden(goldenDir, label);
    if (!golden) continue;
    const tsBytes = await candidateBytes(candidate, golden);
    if (tsBytes === null) {
      console.log(`? ${label}: no candidate response`);
      failures++;
      continue;
    }
    const result = diffJson(golden.responseBytes, tsBytes);
    console.log(formatDiffReport(label, result));
    if (!result.equal) failures++;
  }
  console.log(`\n${files.length - failures}/${files.length} case(s) byte-green`);
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
