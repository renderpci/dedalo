/**
 * THE WEB-REFERENCE PROOF (spec S4, §5.9 `provision check`, §4.3 `web.vhost`): the operator's
 * vhost carries ONE stamped reference to our web include (Apache `IncludeOptional
 * <configBase>/<instance>/web.apache.conf`; nginx the zero-match glob `include
 * <configBase>/<instance>/web.nginx.con[f];`). A reference in a file proves nothing by itself —
 * the file may not be loaded, or the line may sit in a disabled site — so the proof is the
 * server's OWN account of what it loads:
 *   - Apache: `-t -D DUMP_INCLUDES` lists every file it read (an IncludeOptional that matched
 *     nothing is absent: before the first apply the include is honestly "not loaded");
 *   - nginx: `-T` prints every loaded file under `# configuration file <path>:`.
 * Missing = drift "the vhost no longer includes <path>".
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node:path and ./init/parse/{apache,nginx} only.
 */
import { join } from 'node:path';
import { parseDumpIncludes } from './init/parse/apache';
import { splitNginxT } from './init/parse/nginx';

/** The web include's path (`<configBase>/<instance>/web.<server>.conf`, render/web_include.ts writes it). */
export function webIncludePath(configBase: string, instance: string, server: 'apache' | 'nginx'): string {
  return join(configBase, instance, `web.${server}.conf`);
}

/**
 * nginx's reference argument: the include path with its last letter as a one-character class
 * (`web.nginx.con[f]`), a glob that matches zero files before the first apply — nginx has no
 * optional include, and a removed instance must not break the server.
 */
export function webReferenceInclude(configBase: string, instance: string): string {
  const path = webIncludePath(configBase, instance, 'nginx');
  return `${path.slice(0, -1)}[${path.slice(-1)}]`;
}

/** True when the server's dump shows `includePath` loaded. */
export function webReferencePresent(server: 'apache' | 'nginx', dumpText: string, includePath: string): boolean {
  if (server === 'apache') return parseDumpIncludes(dumpText).includes(includePath);
  return splitNginxT(dumpText).some(file => file.file === includePath);
}
