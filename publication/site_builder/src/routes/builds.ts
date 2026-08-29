/**
 * Build + preview routes — trigger a build, poll its status/log, and get the preview URL.
 *
 * Build is a mutation (audited); it returns 202 with the build id and runs detached.
 * Status and log are reads the client polls. Preview returns the stable preprod URL for
 * the site plus the currently-served release, so the UI can point (and cache-bust) its
 * iframe.
 */

import { json } from '../util/response';
import { requireActor } from '../security/auth';
import { NotFoundError, ValidationError } from '../errors';
import { audit } from '../audit';
import { readManifest } from '../sites/manifest';
import { siteExists } from '../sites/workspace';
import { declaredSurface, siteUrl } from '../sites/webspace';
import { startBuild, getBuild, getBuildLog } from '../build/builder';
import { currentRelease } from '../build/promote';

export async function handleBuild(req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);

  const result = await startBuild(slug);
  await audit({ actor, action: 'build', site: slug, detail: { build_id: result.build_id } });
  return json(result, 202);
}

export async function handleGetBuild(_req: Request, params: Record<string, string>): Promise<Response> {
  const { slug, id } = params;
  const record = await getBuild(slug, id);
  if (!record) throw new NotFoundError(`No build '${id}' for '${slug}'`);
  const log = await getBuildLog(slug, id);
  return json({ ...record, log: log ?? '' });
}

export async function handlePreview(_req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  // The preview URL is the site's OWN draft host (`pre.<domain>`), not a shared base URL
  // with the slug as a path: each site has its own vhost on both surfaces.
  const manifest = await readManifest(slug);
  // The DECLARED surface (the provisioner's row), never a derived one, and no proving: a
  // preview is a read. A site with no row has no preview release, which is what null says.
  const preprod = declaredSurface(manifest, 'preprod');
  const release = preprod ? await currentRelease(preprod) : null;
  return json({
    url: siteUrl(manifest, 'preprod'),
    release,
    built_at: null,
  });
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
