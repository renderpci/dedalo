/**
 * Zod schema for the v7 AUTHORING register.json format (mirrors
 * src/core/tools/client/register.schema.json and PHP tools_register::
 * validate_register). Hand-written tools use this flat shape; it is converted to
 * the column-keyed matrix record before the runtime validation runs.
 *
 * The 34 seeded register.json files are column-keyed DUMPS, not authoring files,
 * so they bypass this schema (pass-through) — this validates NEW tools and the
 * tool_dev_template exemplar.
 */

import { z } from 'zod';

const LANG_KEY = /^lg-[a-z0-9_]+$/;
const TOOL_NAME = /^tool_[a-z0-9_]+$/;
const SEMVER = /^\d+\.\d+(\.\d+)?([.-][0-9A-Za-z.]+)?$/;
const DEDALO_VERSION = /^\d+\.\d+(\.\d+)?$/;

/** A lang-keyed string map, e.g. { "lg-eng": "Export" }. */
const langMap = z.record(z.string().regex(LANG_KEY), z.string());

export const authoringRegisterSchema = z
	.object({
		$schema: z.string().optional(),
		name: z.string().regex(TOOL_NAME),
		version: z.string().regex(SEMVER),
		label: langMap.refine((m) => Object.keys(m).length >= 1, 'at least one label language'),
		description: langMap.optional(),
		developer: z.string().optional(),
		dedalo_version_min: z.string().regex(DEDALO_VERSION).optional(),
		affected_models: z.array(z.string()).optional(),
		affected_tipos: z.array(z.string()).optional(),
		show_in_inspector: z.boolean().optional(),
		show_in_component: z.boolean().optional(),
		require_translatable: z.boolean().optional(),
		always_active: z.boolean().optional(),
		active: z.boolean().optional(),
		properties: z.union([z.record(z.unknown()), z.null()]).optional(),
		labels: z
			.array(
				z.object({
					lang: z.string().regex(LANG_KEY),
					name: z.string(),
					value: z.string(),
				}),
			)
			.optional(),
		ontology: z.union([z.array(z.unknown()), z.null()]).optional(),
		config: z.union([z.record(z.unknown()), z.null()]).optional(),
		default_config: z.union([z.record(z.unknown()), z.null()]).optional(),
	})
	.strict();

export type AuthoringRegister = z.infer<typeof authoringRegisterSchema>;
