#!/usr/bin/env bun
/**
 * Capture golden-master responses from a running Dédalo instance.
 *
 *   DEDALO_API_URL=http://host/dedalo/core/api/v1/json/ \
 *   DEDALO_SESSION_COOKIE='PHPSESSID=…' DEDALO_CSRF_TOKEN='…' \
 *   bun run capture [--out fixtures/golden] [--corpus extra-corpus.json]
 *
 * Writes one <label>.json GoldenMaster per corpus case. Auth-requiring cases are
 * skipped when no session cookie is configured.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureResponse, configFromEnv } from '../capture_client.ts';
import { loadCorpus } from '../corpus.ts';
import { login } from '../login.ts';
import type { CaptureConfig } from '../capture_client.ts';
import type { GoldenMaster } from '../index.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<number> {
  const cfg = configFromEnv();
  const outDir = arg('--out', join(import.meta.dir, '../../fixtures/golden'));
  const corpusFile = arg('--corpus', process.env.CORPUS_FILE ?? '');
  const corpus = await loadCorpus(corpusFile || undefined);
  await mkdir(outDir, { recursive: true });

  // Optionally authenticate, so requiresAuth cases can be captured. Credentials
  // come from DEDALO_LOGIN_USER / DEDALO_LOGIN_PASS.
  const user = process.env.DEDALO_LOGIN_USER;
  const pass = process.env.DEDALO_LOGIN_PASS;
  const authCfg: CaptureConfig = { ...cfg };
  if (user && pass) {
    const session = await login(cfg.apiUrl, user, pass);
    authCfg.cookie = session.cookie;
    authCfg.csrfToken = session.csrfToken;
    console.log(`Authenticated as ${user} (cookie + CSRF acquired)`);
  }

  let captured = 0;
  let skipped = 0;
  console.log(`Capturing ${corpus.length} case(s) from ${cfg.apiUrl}`);
  for (const c of corpus) {
    if (c.requiresAuth && !authCfg.cookie) {
      console.log(`  - ${c.label}: SKIP (requires auth; set DEDALO_LOGIN_USER/PASS)`);
      skipped++;
      continue;
    }
    const rqo = c.pretty ? { ...c.rqo, pretty_print: true } : c.rqo;
    try {
      const res = await captureResponse(c.requiresAuth ? authCfg : cfg, rqo);
      const golden: GoldenMaster = {
        label: c.label,
        rqo,
        capturedAt: new Date().toISOString(),
        status: res.status,
        contentType: res.contentType,
        responseBytes: res.rawBytes,
      };
      await Bun.write(join(outDir, `${c.label}.json`), JSON.stringify(golden, null, 2));
      console.log(`  ✓ ${c.label}: HTTP ${res.status}, ${res.rawBytes.length} bytes`);
      captured++;
    } catch (err) {
      console.error(`  ✗ ${c.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nDone. captured=${captured} skipped=${skipped} -> ${outDir}`);
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
