/**
 * Publish, releases, rollback and the audit tail.
 *
 * Publish is the gated act: the engine only proxies it for a developer/global-admin, and
 * the daemon additionally requires an explicit `confirm: true` in the body so a stray call
 * without the confirmation dialog cannot push a site live. It promotes the previewed
 * preprod bytes to production (build/publish.ts) and audits who did it with an optional
 * note. Rollback re-activates a retained production release. The audit route tails the
 * append-only log for the admin UI.
 */

import { json } from '../util/response';
import { requireActor } from '../security/auth';
import { ValidationError } from '../errors';
import { audit, readAudit } from '../audit';
import { publishSite, rollbackSite, productionReleases } from '../build/publish';

export async function handlePublish(req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);
  // The daemon-side backstop for the gated action: an explicit confirmation is required
  // even though the engine already restricts who may call this.
  if (body.confirm !== true) {
    throw new ValidationError('publish requires an explicit confirm: true');
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined;

  const result = await publishSite(slug, actor);
  await audit({ actor, action: 'publish', site: slug, detail: { release: result.release, note } });
  return json(result);
}

export async function handleListReleases(_req: Request, params: Record<string, string>): Promise<Response> {
  return json(await productionReleases(params.slug));
}

export async function handleRollback(req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);
  const release = String(body.release ?? '');

  const result = await rollbackSite(slug, release, actor);
  await audit({ actor, action: 'rollback', site: slug, detail: { release: result.release } });
  return json(result);
}

export async function handleAudit(_req: Request, _params: Record<string, string>, url: URL): Promise<Response> {
  const site = url.searchParams.get('site') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  if (limit !== undefined && !Number.isFinite(limit)) throw new ValidationError('limit must be a number');
  return json({ data: await readAudit({ site, limit }) });
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}
