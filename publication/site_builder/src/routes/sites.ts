/**
 * Site CRUD routes — create, list, detail, delete.
 *
 * These are the P0 surface: everything an operator needs to stand up and tear down a site
 * before any agent runs. Each mutating handler validates its actor (the engine always
 * supplies one), performs the workspace operation, and writes an audit line. Read
 * handlers assemble the status join (sites/store.ts).
 */

import { json } from '../util/response';
import { requireActor } from '../security/auth';
import { NotFoundError, ValidationError } from '../errors';
import { audit } from '../audit';
import { createSite, deleteSite, siteExists, type CreateSiteInput } from '../sites/workspace';
import { siteStatus, allSiteStatuses } from '../sites/store';

export async function handleCreateSite(req: Request): Promise<Response> {
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);

  const input: CreateSiteInput = {
    slug: String(body.slug ?? ''),
    name: String(body.name ?? ''),
    // The domain the operator has pointed at this site — required, because it is what pairs
    // the site with the webspace the provisioner created for it (src/sites/webspace.ts).
    domain: String(body.domain ?? ''),
    template: typeof body.template === 'string' ? body.template : undefined,
    driver: normalizeDriver(body.driver),
    actor,
  };

  const manifest = await createSite(input);
  await audit({
    actor,
    action: 'create_site',
    site: manifest.slug,
    detail: { template: manifest.template, domain: manifest.domain },
  });
  const status = await siteStatus(manifest.slug);
  return json(status, 201);
}

export async function handleListSites(): Promise<Response> {
  const sites = await allSiteStatuses();
  return json({ data: sites });
}

export async function handleGetSite(_req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  return json(await siteStatus(slug));
}

export async function handleDeleteSite(req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const slug = params.slug;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);
  const purgeProd = url.searchParams.get('purge_prod') === 'true';

  // The result carries what was NOT removed, and it is reported in both directions — to the
  // caller and into the audit trail. A delete that silently left a museum's live production
  // in place (because the webspace no longer declares itself ours, say) would look exactly
  // like one that took it down, and the operator would learn the difference from a browser.
  const result = await deleteSite(slug, purgeProd);
  await audit({
    actor,
    action: 'delete_site',
    site: slug,
    detail: { purge_prod: purgeProd, removed: result.removed, skipped: result.skipped },
  });
  return json({
    deleted: slug,
    purged_prod: purgeProd,
    removed_surfaces: result.removed,
    skipped_surfaces: result.skipped,
  });
}

// --- helpers ---

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

function normalizeDriver(value: unknown): CreateSiteInput['driver'] {
  if (value === 'claude_code' || value === 'opencode' || value === 'pi') return value;
  return undefined;
}
