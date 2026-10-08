/**
 * THE PROVISIONED NGINX MAP INCLUDE (spec §13.6) — `/etc/nginx/conf.d/dedalo_media_map.conf`,
 * root:root 0644, ONE file shared by every publication-host instance on the host (kind
 * `nginx_map_include`, stamped `_host`: hash.ts HOST_WIDE_KINDS).
 *
 * It only includes root's live host map (src/rules/host_map_main.ts writes it, under
 * HOST_NGINX_MAP_DIR). The include names the file through a ZERO-MATCH glob (`.con[f]`): before
 * the first `rules.map` push nothing exists and nginx stays valid with nothing defined; after
 * it, the glob matches exactly the live map. A pure function of the host paths, so every nginx
 * instance's plan renders the same bytes (idempotent across instances).
 *
 * Only on an nginx host whose declaration sets `web.nginx_map: conf_d`; `none` (the default)
 * leaves the http{} map to the operator. Effect `reload_web`, validator `web` (the configtest
 * runs after the rename, under the host web lock, restoring on failure — plan/apply.ts).
 *
 * PURE, ZERO-DEPENDENCY.
 */
import { join } from 'node:path';
import type { AgentLayout } from '../layout';
import type { Artifact, RenderFacts, Renderer } from './types';
import { artifact } from './types';

/** The live host map below HOST_NGINX_MAP_DIR (src/rules/host_map.ts HOST_MAP_FILE). */
export const HOST_MAP_LIVE_NAME = 'dedalo_media_map.nginx.conf';

/** The zero-match glob of the live map: the last character as a one-character class. */
export function zeroMatchGlob(path: string): string {
  if (!/^\/[A-Za-z0-9._/-]+[A-Za-z0-9]$/.test(path)) {
    throw new Error(`render(nginx_map_include): '${path}' is not a plain absolute path. Nothing was rendered.`);
  }
  return `${path.slice(0, -1)}[${path.slice(-1)}]`;
}

/** The include's body below the stamp. */
export function nginxMapIncludeBody(layout: AgentLayout): string {
  return [
    '# The Dédalo media map, shared by every publication-host instance on this host.',
    '# Its content is pushed by the work system (apply_rules); until then nothing is defined.',
    `include ${zeroMatchGlob(join(layout.host.nginxMapDir, HOST_MAP_LIVE_NAME))};`,
    '',
  ].join('\n');
}

export const nginxMapIncludeRenderer: Renderer = {
  kind: 'nginx_map_include',
  appliesTo: layout => layout.web.server === 'nginx' && layout.web.nginxMap === 'conf_d',
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    return [
      artifact(layout, {
        kind: 'nginx_map_include',
        path: layout.host.nginxMapInclude,
        mode: 'nginxMapInclude',
        body: nginxMapIncludeBody(layout),
        effects: ['reload_web'],
        validate: 'web',
        hostWide: true,
      }),
    ];
  },
};
