/**
 * THE IMAGE-CHANNEL BLOCK of the update_code panel (installer unification D3,
 * 2026-10-09) — `consumer.image`, present ONLY when channel.ts says this tree
 * lives in a product image (status.ts adds it under the same predicate as the
 * `channel` check).
 *
 * Before this block the panel's whole answer on a Docker installation was a
 * refusal: "Update blocked — deployment channel: image", with nothing to act
 * on. The in-container swap really is refused (a swap into the container's
 * writable layer is lost on the next recreation), so `checks` and `ready` do
 * not change; what changes is that the panel now says WHERE this
 * installation's image comes from and HOW it is updated: the host command
 * (deploy/dedalo-image-update.sh --version <tag>), or — when the operator
 * installed the host updater — a request the host picks up.
 *
 * FACTS ON THE WIRE, WORDS IN LABELS. Every field is a fact (a repository, a
 * mode, an id, a timestamp) or a machine id; the client composes the command
 * from `update_command` and the release it lists, and words it from labels.
 *
 * IT NEVER THROWS. Every source is a validated read that degrades to null:
 * an undeclared or invalid image source, an unreadable registry list, a
 * malformed channel file. Gate: test/unit/update_status_native.test.ts.
 */

import {
	type ImageRegistryList,
	loadImageRegistries,
	matchOfficialRegistry,
} from './image_registries.ts';
import { declaredImageSource, type ImageSource, type ImageSourceGetter } from './image_source.ts';
import {
	type HostUpdaterView,
	imageUpdateDir,
	type PendingRequestView,
	readChannelStatus,
	type StoredOutcome,
} from './image_update_channel.ts';

/** The host program an operator runs, and the flag that names the release. */
export const IMAGE_UPDATE_COMMAND = Object.freeze({
	program: 'deploy/dedalo-image-update.sh',
	version_flag: '--version',
} as const);

/** `consumer.image` (design 5.5; WC-2026-10-09-update-code-image-channel). */
export interface ImageChannelBlock {
	source: {
		mode: ImageSource['mode'];
		repository: string | null;
		/** The official registry the repository IS, or null (custom, or none declared). */
		official: { id: string; label: string; role: 'primary' | 'mirror' } | null;
	};
	update_command: typeof IMAGE_UPDATE_COMMAND;
	host_updater: HostUpdaterView;
	request: PendingRequestView | null;
	last_outcome: StoredOutcome | null;
}

/** Test seams — production passes none. */
export interface ImageChannelSeams {
	/** The image source getter (default: the process environment). */
	sourceGetter?: ImageSourceGetter;
	/** The registry list (default: engineering/image_registries.json). */
	registries?: () => ImageRegistryList;
	/** The channel dir (default: <private>/image_update). */
	dir?: string;
	now?: Date;
}

/** The official entry a declared repository is, or null — never a throw. */
function officialOf(
	repository: string | null,
	registries: () => ImageRegistryList,
): ImageChannelBlock['source']['official'] {
	if (repository === null) return null;
	try {
		return matchOfficialRegistry(repository, registries());
	} catch {
		return null;
	}
}

/** The block, assembled from the three sources; each degrades on its own. */
export async function imageChannelBlock(seams: ImageChannelSeams = {}): Promise<ImageChannelBlock> {
	const source = declaredImageSource(seams.sourceGetter);
	const channel = await readChannelStatus(seams.now ?? new Date(), imageUpdateDir(seams.dir));
	return {
		source: {
			mode: source.mode,
			repository: source.repository,
			official: officialOf(source.repository, seams.registries ?? (() => loadImageRegistries())),
		},
		update_command: IMAGE_UPDATE_COMMAND,
		...channel,
	};
}
