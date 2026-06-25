import { z } from 'zod';
import { SourceSchema } from './source.ts';
import { SqoSchema } from './sqo.ts';

/**
 * RqoSchema / Rqo
 * Request Query Object — the envelope for every Dédalo API call.
 *
 * Ground truth: core/api/v1/common/class.dd_manager.php. `action` is the
 * mandatory dispatch key; `dd_api` routes to the API class (defaults
 * server-side to `dd_core_api`). `source` identifies the target, `sqo`
 * carries search parameters, `options` carries action-specific extras
 * (and may itself nest `sqo`/`csrf_token`), and `show`/`search` carry the
 * `ddo_map` request-config that `sanitize_client_rqo()` scrubs.
 *
 * The schema is `.passthrough()` because the manager only ever reads the
 * fields below; unknown client keys are ignored, not rejected. We keep
 * `options`/`show`/`search` as open objects to match that openness while
 * still validating the nested `sqo`.
 */
export const RqoSchema = z
	.object({
		action: z.string(),
		dd_api: z.string().optional(),
		source: SourceSchema.optional(),
		sqo: SqoSchema.optional(),
		options: z
			.object({
				sqo: SqoSchema.optional(),
				csrf_token: z.string().optional(),
			})
			.passthrough()
			.optional(),
		show: z.record(z.any()).optional(),
		search: z.record(z.any()).optional(),
		id: z.union([z.string(), z.number()]).optional(),
		prevent_lock: z.boolean().optional(),
		csrf_token: z.string().optional(),
		key_dir: z.string().optional(),
		row_key: z.string().optional(),
		// Further request_query_object::$direct_keys mapped by the JSON dispatcher
		// (core/api/v1/json/index.php ~194, ~449). Open types: PHP does not constrain them.
		api_engine: z.string().optional(),
		choose: z.any().optional(),
		data: z.any().optional(),
		pretty_print: z.any().optional(),
	})
	.passthrough();

export type Rqo = z.infer<typeof RqoSchema>;
