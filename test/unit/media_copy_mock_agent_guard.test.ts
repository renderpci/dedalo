/**
 * The mock copy agent writes host records + bearer tokens only through a SCRATCH
 * publication-hosts store (test_db_marker_tripwire EXEMPT_WRITERS claim, made mechanical):
 * unarmed, or after dispose, every store-writing door refuses before its first write.
 */
import { describe, expect, test } from 'bun:test';
import { publicationHostsTestRefusal } from '../../src/core/publication_host/registry.ts';
import {
	assertScratchCopyStores,
	startCopyMockAgent,
	unregisterCopyMockHost,
	useScratchMediaCopyStores,
} from '../helpers/media_copy_mock_agent.ts';

describe('media_copy_mock_agent scratch guard', () => {
	test('armed → allowed; after dispose → every writer refuses before writing', async () => {
		const stores = useScratchMediaCopyStores();
		expect(() => assertScratchCopyStores('probe')).not.toThrow();
		stores.dispose();
		expect(publicationHostsTestRefusal(true)).not.toBeNull();
		expect(() => assertScratchCopyStores('probe')).toThrow(/useScratchMediaCopyStores/);
		await expect(startCopyMockAgent('zzmc_guard', 'copy')).rejects.toThrow(
			/startCopyMockAgent refused/,
		);
		await expect(unregisterCopyMockHost('zzmc_guard')).rejects.toThrow(
			/unregisterCopyMockHost refused/,
		);
	});
});
