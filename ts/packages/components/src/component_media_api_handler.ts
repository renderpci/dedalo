/**
 * Native handler scaffolding for the four COMPONENT-MEDIA dd_*_api classes:
 *   - dd_component_av_api        (core/api/v1/common/class.dd_component_av_api.php)
 *   - dd_component_portal_api    (core/api/v1/common/class.dd_component_portal_api.php)
 *   - dd_component_text_area_api (core/api/v1/common/class.dd_component_text_area_api.php)
 *   - dd_component_3d_api        (core/api/v1/common/class.dd_component_3d_api.php)
 *
 * SCOPE (this brick): document the API surface and route every action to PHP.
 * After studying each PHP action against the live install, NONE of the
 * component-media actions is byte-reproducible from the DB + config + the ported
 * media-path layer alone — they all need un-ported subsystems (ffmpeg/ffprobe,
 * filesystem writes, the thesaurus/SQO resolvers, or component writes/Save). So
 * every action DECLINES → proxy. These handlers register the verbatim PHP
 * API_ACTIONS allowlists (SEC-024) so the surface is explicit in the registry,
 * but `canHandleRequest` always returns false, so the Bun edge falls through to
 * the byte-faithful PHP proxy for every request.
 *
 * Why each action declines (rqo → response → reason), from PHP + live probes:
 *
 *   dd_component_av_api
 *     - download_fragment   : cuts a time-coded fragment via Ffmpeg::build_fragment
 *                             and returns its public URL → needs ffmpeg + the source
 *                             media file on disk. DECLINE (file generation).
 *     - get_media_streams   : component_av::get_media_streams → Ffmpeg ffprobe on the
 *                             resolved quality file → needs ffprobe + the file.
 *                             (Live returns result:false here because no media file
 *                             exists; the false vs ffprobe-object outcome is purely a
 *                             function of on-disk state, not DB/config.) DECLINE.
 *     - create_posterframe  : ffmpeg single-frame extract + thumb (write). DECLINE.
 *     - delete_posterframe  : component_av::delete_posterframe → unlink() (write).
 *                             DECLINE.
 *
 *   dd_component_portal_api
 *     - delete_locator      : remove_locator_from_data + component->Save() (write).
 *                             DECLINE.
 *
 *   dd_component_text_area_api
 *     - delete_tag          : delete_tag_from_all_langs across every lang + Save
 *                             (multi-lang write). DECLINE.
 *     - get_tags_info       : a READ, but it resolves index/reference tags through
 *                             ts_object::get_term_by_locator (un-ported thesaurus
 *                             tree resolver), person tags through a 'related' SQO +
 *                             sections::get_instance (un-ported search engine), and
 *                             note tags through TR::get_mark_pattern parsing + per-note
 *                             DDO-map component instantiation. The empty-data result
 *                             ({tags_index:[],tags_persons:[],tags_notes:null,
 *                             tags_reference:[]}, confirmed live for rsc36) is only
 *                             reachable once every one of those resolvers is proven
 *                             empty — which requires walking the portal data, the
 *                             related-sections SQO and the note-tag text, i.e. running
 *                             the very un-ported subsystems. Not safely byte-
 *                             reproducible from DB + config. DECLINE.
 *
 *   dd_component_3d_api
 *     - move_file_to_dir    : rename() an uploaded tmp file into the media tree
 *                             (+ thumb + Save for 'posterframe'). Filesystem write.
 *                             DECLINE.
 *     - delete_posterframe  : component_3d::delete_posterframe → unlink() (write).
 *                             DECLINE.
 *
 * None of these actions appears in NO_LOGIN_NEEDED_ACTIONS or CSRF_EXEMPT_ACTIONS,
 * so PHP requires login + CSRF for all of them; the proxy path preserves that
 * verbatim (the request is forwarded with its cookie + CSRF header untouched).
 */

import type { ApiHandler, ApiResponse, RqoLike } from '@dedalo/core-api';

/**
 * The four component-media dd_api classes with their verbatim PHP API_ACTIONS
 * allowlists (exact order). Each is registered as an all-decline handler.
 */
export const COMPONENT_MEDIA_API_ACTIONS: ReadonlyArray<{
  readonly ddApi: string;
  readonly actions: readonly string[];
}> = [
  {
    ddApi: 'dd_component_av_api',
    actions: [
      'download_fragment',
      'get_media_streams',
      'create_posterframe',
      'delete_posterframe',
    ],
  },
  {
    ddApi: 'dd_component_portal_api',
    actions: ['delete_locator'],
  },
  {
    ddApi: 'dd_component_text_area_api',
    actions: ['delete_tag', 'get_tags_info'],
  },
  {
    ddApi: 'dd_component_3d_api',
    actions: ['move_file_to_dir', 'delete_posterframe'],
  },
];

/**
 * Build the four component-media handlers. Every one declares its PHP API_ACTIONS
 * allowlist (so the surface is explicit / SEC-024-matched) but owns NO request:
 * `canHandleRequest` always returns false, so the Bun edge proxies every action
 * to PHP byte-identically. `dispatch` is a defensive never-path (the edge only
 * dispatches when canHandleRequest is true).
 */
export function createComponentMediaApiHandlers(): ApiHandler[] {
  return COMPONENT_MEDIA_API_ACTIONS.map(({ ddApi, actions }) => ({
    ddApi,
    apiActions: new Set(actions),

    // Every component-media action needs an un-ported subsystem (ffmpeg/ffprobe,
    // filesystem, thesaurus/SQO, or a component write) → decline → proxy.
    canHandleRequest(_rqo: RqoLike): boolean {
      return false;
    },

    // Defensive: unreachable because canHandleRequest always declines. Kept so the
    // ApiHandler contract is satisfied and a misroute fails loud rather than silent.
    dispatch(action: string): ApiResponse {
      return {
        result: false,
        msg: `Error. Request failed [${action}] (component-media action is proxy-only)`,
        errors: ['not ported'],
      };
    },
  }));
}
