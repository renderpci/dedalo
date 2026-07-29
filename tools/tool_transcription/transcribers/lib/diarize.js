// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* DIARIZE
* Pure speaker-diarization post-processing: turn the per-chunk output of the
* segmentation model into global speaker turns, attribute recognised segments
* to those turns, and summarise speakers for the mapping dialog.
*
* WHY PURE. The model inference itself (pyannote segmentation via
* Transformers.js) lives in the Worker (browser_whisper.js) because it needs
* the ONNX runtime; everything AFTER the logits is deterministic bookkeeping
* that must be testable under bun without a browser — same split as
* vad.js/transcript_postprocess.js.
*
* THE STITCHING PROBLEM. The segmentation model classifies short windows
* independently and labels speakers LOCALLY — "speaker 0" of one chunk and
* "speaker 1" of the next may be the same person. Chunks are therefore decoded
* with an overlap, and a chunk's local speakers are matched to the global ones
* by CO-ACTIVITY inside the overlap zone: whoever talks at the same moments IS
* the same speaker. An interview has 2-3 voices with clear turn-taking, which
* is exactly the case this matching is reliable for; a round-table with heavy
* crosstalk is not this tool's job.
*
* Times are SECONDS. Speakers are global integer ids (0, 1, 2…) in order of
* first appearance — the mapping dialog turns them into person tags.
*/


/**
* DEFAULT_DIARIZE
* - chunk_seconds/overlap_seconds: the Worker's decode chunking. Co-activity
*   matching can only re-identify a voice that is AUDIBLE inside the shared
*   overlap — so chunks are LONG (the model's recurrent core keeps local
*   labels consistent across arbitrary lengths; 5 minutes is ~19 MB of PCM)
*   and the overlap is a full conversational beat (30s), which in an
*   interview almost always contains both voices. A speaker genuinely absent
*   from an overlap still becomes a NEW id rather than a guess — the mapping
*   dialog lets the archivist assign two detected speakers to the same
*   person, which degrades gracefully instead of silently merging strangers.
* - min_turn_seconds: turns shorter than this are model noise (a cough, a
*   backchannel "mm") — attribution over them is meaningless.
* - merge_gap_seconds: same-speaker turns closer than this are ONE turn.
* - match_min_seconds: minimum co-activity to accept a cross-chunk identity
*   match — below it a NEW global speaker is opened instead of guessing.
*/
export const DEFAULT_DIARIZE = {
	chunk_seconds		: 300,
	overlap_seconds		: 30,
	min_turn_seconds	: 0.4,
	merge_gap_seconds	: 0.8,
	match_min_seconds	: 0.2,
	// Voice-fingerprint clustering (cluster_speaker_turns): two turn groups
	// whose embedding centroids reach this cosine SIMILARITY are the same
	// person. WeSpeaker ResNet34-LM same-speaker pairs typically score
	// 0.55-0.8, different speakers 0.1-0.35 — 0.5 splits them with margin.
	cluster_similarity	: 0.5,
	// The slice of a turn handed to the embedding model: long enough to
	// fingerprint reliably, short enough to bound the compute (centered).
	embed_max_seconds	: 10
};


/**
* OVERLAP_SECONDS
* Length of the intersection of two [start,end] intervals (0 when disjoint).
*
* @param {number} a_start
* @param {number} a_end
* @param {number} b_start
* @param {number} b_end
* @returns {number}
*/
function overlap_seconds( a_start, a_end, b_start, b_end ) {

	return Math.max( 0, Math.min(a_end, b_end) - Math.max(a_start, b_start) );
}//end overlap_seconds


/**
* STITCH_DIARIZATION_CHUNKS
* Per-chunk local turns → global speaker turns on the recording's timeline.
*
* @param {Array<Object>} chunks - [{offset, turns:[{id, start, end}]}] with
*   `offset` = the chunk's position in the recording and turn times RELATIVE
*   to the chunk (exactly what the model post-processing emits per chunk).
* @param {Object} [options] - see DEFAULT_DIARIZE
* @returns {Array<Object>} turns [{speaker, start, end}] absolute, sorted,
*   same-speaker turns merged, short noise turns dropped.
*/
export function stitch_diarization_chunks( chunks, options ) {

	const opts = Object.assign({}, DEFAULT_DIARIZE, options || {});

	if (!Array.isArray(chunks) || chunks.length===0) {
		return [];
	}

	const global_turns	= [];	// [{speaker, start, end}] absolute, grows chunk by chunk
	let next_speaker	= 0;

	for (let k = 0; k < chunks.length; k++) {

		const chunk		= chunks[k];
		const offset	= typeof chunk.offset==='number' ? chunk.offset : 0;
		const turns		= (Array.isArray(chunk.turns) ? chunk.turns : [])
			.filter( turn => typeof turn.start==='number' && typeof turn.end==='number' && turn.end>turn.start )
			.map( turn => ({
				id		: turn.id,
				start	: offset + turn.start,
				end		: offset + turn.end
			}) );

		// Local speaker id → global speaker id for THIS chunk.
		const id_map = new Map();

		if (k>0) {
			// Match local speakers to global ones by co-activity in the overlap
			// zone this chunk shares with everything already stitched.
			const zone_start	= offset;
			const zone_end		= offset + opts.overlap_seconds;

			const local_ids = [...new Set( turns.map( turn => turn.id ) )];
			// [local, global, co-activity] candidates, best first, assigned
			// greedily one-to-one (a person cannot be two global speakers).
			const candidates = [];
			for (const local of local_ids) {
				const local_zone_turns = turns.filter( turn => turn.id===local );
				const co = new Map();
				for (const g of global_turns) {
					if (g.end<=zone_start || g.start>=zone_end) continue;
					for (const turn of local_zone_turns) {
						const shared = overlap_seconds(
							Math.max(turn.start, zone_start), Math.min(turn.end, zone_end),
							Math.max(g.start, zone_start), Math.min(g.end, zone_end)
						);
						if (shared>0) co.set( g.speaker, (co.get(g.speaker) || 0) + shared );
					}
				}
				for (const [speaker, seconds] of co) {
					candidates.push({ local: local, speaker: speaker, seconds: seconds });
				}
			}
			candidates.sort( (a, b) => b.seconds - a.seconds );
			const taken_locals	= new Set();
			const taken_globals	= new Set();
			for (const candidate of candidates) {
				if (candidate.seconds<opts.match_min_seconds) break;
				if (taken_locals.has(candidate.local) || taken_globals.has(candidate.speaker)) continue;
				id_map.set( candidate.local, candidate.speaker );
				taken_locals.add( candidate.local );
				taken_globals.add( candidate.speaker );
			}
		}

		for (const turn of turns) {
			let speaker = id_map.get( turn.id );
			if (speaker===undefined) {
				speaker = next_speaker++;
				id_map.set( turn.id, speaker );
			}
			global_turns.push({ speaker: speaker, start: turn.start, end: turn.end });
		}
	}

	return finalize_turns( global_turns, opts );
}//end stitch_diarization_chunks


/**
* FINALIZE_TURNS
* Merge + denoise a raw turn list: sort, fuse same-speaker turns that touch or
* nearly touch (this also collapses duplicated detections inside overlap
* zones), renumber speakers by FIRST APPEARANCE (so "speaker 1" is always the
* first voice heard, whatever internal ids clustering produced), then drop
* what is too short to mean a speaking turn.
*
* @param {Array<Object>} raw_turns - [{speaker, start, end}] any order/ids
* @param {Object} opts - resolved DEFAULT_DIARIZE options
* @returns {Array<Object>} turns, sorted, merged, 0-based appearance-ordered
*/
function finalize_turns( raw_turns, opts ) {

	const turns = [...raw_turns].sort( (a, b) => a.start - b.start || a.speaker - b.speaker );

	const merged = [];
	for (const turn of turns) {
		const last = merged.length>0 ? merged[merged.length - 1] : null;
		const previous_same = merged.findLast
			? merged.findLast( item => item.speaker===turn.speaker )
			: [...merged].reverse().find( item => item.speaker===turn.speaker );
		if (previous_same && turn.start - previous_same.end<=opts.merge_gap_seconds && previous_same===last) {
			previous_same.end = Math.max( previous_same.end, turn.end );
			continue;
		}
		if (previous_same && overlap_seconds(previous_same.start, previous_same.end, turn.start, turn.end)>0) {
			previous_same.end = Math.max( previous_same.end, turn.end );
			continue;
		}
		merged.push({ speaker: turn.speaker, start: turn.start, end: turn.end });
	}

	const kept = merged.filter( turn => (turn.end - turn.start)>=opts.min_turn_seconds );

	// Appearance-ordered renumbering: stable, human-friendly ids.
	const id_map = new Map();
	for (const turn of kept) {
		if (!id_map.has(turn.speaker)) id_map.set( turn.speaker, id_map.size );
	}
	return kept.map( turn => ({ speaker: id_map.get(turn.speaker), start: turn.start, end: turn.end }) );
}//end finalize_turns


/**
* CLUSTER_SPEAKER_TURNS
* GLOBAL speaker identity from VOICE FINGERPRINTS — the coherent alternative
* to overlap stitching for long recordings.
*
* Co-activity stitching can only re-identify a voice that happens to speak
* inside a chunk overlap; over an hour of interview that fragments one person
* into several detected speakers. Here every chunk-local speaker GROUP (the
* segmentation model is consistent within a chunk) carries an embedding — a
* voice fingerprint from the speaker-verification model — and groups whose
* centroids are similar enough ARE the same person, no matter how far apart
* they spoke. Duration-weighted average-linkage agglomerative clustering:
* with tens of groups the O(n³) worst case is microseconds.
*
* @param {Array<Object>} groups - one per chunk-local speaker:
*   { turns: [{start, end}], embedding: number[]|Float32Array|null }
*   (a null embedding — the fingerprint failed — keeps its own identity
*   rather than guessing; finalize_turns renumbers everything by appearance)
* @param {Object} [options] - see DEFAULT_DIARIZE (cluster_similarity)
* @returns {Array<Object>} turns [{speaker, start, end}] merged + appearance-ordered
*/
export function cluster_speaker_turns( groups, options ) {

	const opts = Object.assign({}, DEFAULT_DIARIZE, options || {});

	if (!Array.isArray(groups) || groups.length===0) {
		return [];
	}

	const normalize = function( vector ) {
		let norm = 0;
		for (const value of vector) norm += value * value;
		norm = Math.sqrt( norm ) || 1;
		return Array.from( vector, value => value / norm );
	};
	const dot = function( a, b ) {
		let sum = 0;
		const length = Math.min( a.length, b.length );
		for (let i = 0; i < length; i++) sum += a[i] * b[i];
		return sum;
	};

	// One cluster per group to start; weight = spoken seconds (a 40-second
	// answer anchors the centroid; a 1-second backchannel barely moves it).
	const clusters = groups.map( (group, index) => {
		const turns = (Array.isArray(group.turns) ? group.turns : [])
			.filter( turn => typeof turn.start==='number' && typeof turn.end==='number' && turn.end>turn.start );
		const weight = turns.reduce( (sum, turn) => sum + (turn.end - turn.start), 0 );
		const has_embedding = group.embedding!==null && group.embedding!==undefined && group.embedding.length>0;
		return {
			id			: index,
			turns		: turns,
			weight		: weight || 0.001,
			embedding	: has_embedding ? normalize( group.embedding ) : null
		};
	}).filter( cluster => cluster.turns.length>0 );

	// Agglomerative: merge the most similar pair while any pair clears the
	// threshold. Fingerprint-less clusters never merge (no guessing).
	for (;;) {
		let best_i = -1;
		let best_j = -1;
		let best_similarity = -1;
		for (let i = 0; i < clusters.length; i++) {
			if (clusters[i].embedding===null) continue;
			for (let j = i + 1; j < clusters.length; j++) {
				if (clusters[j].embedding===null) continue;
				const similarity = dot( clusters[i].embedding, clusters[j].embedding );
				if (similarity>best_similarity) {
					best_similarity	= similarity;
					best_i			= i;
					best_j			= j;
				}
			}
		}
		if (best_i===-1 || best_similarity<opts.cluster_similarity) {
			break;
		}
		const a = clusters[best_i];
		const b = clusters[best_j];
		const merged_embedding = normalize(
			a.embedding.map( (value, index) => value * a.weight + (b.embedding[index] ?? 0) * b.weight )
		);
		a.turns		= a.turns.concat( b.turns );
		a.weight	= a.weight + b.weight;
		a.embedding	= merged_embedding;
		clusters.splice( best_j, 1 );
	}

	const raw_turns = [];
	for (const cluster of clusters) {
		for (const turn of cluster.turns) {
			raw_turns.push({ speaker: cluster.id, start: turn.start, end: turn.end });
		}
	}
	return finalize_turns( raw_turns, opts );
}//end cluster_speaker_turns


/**
* ASSIGN_SPEAKERS_TO_SEGMENTS
* Attribute each recognised segment to the speaker whose turns cover most of
* it. A segment no turn covers (silence-adjacent, or diarization missed it)
* inherits the previous segment's speaker — continuity is the least wrong
* guess inside a conversation — and stays unattributed only at the very start.
*
* Returns NEW segment objects; the caller's array is never mutated.
*
* @param {Array<Object>} segments - {text, start, end, …}
* @param {Array<Object>} turns - [{speaker, start, end}] from the stitcher
* @returns {Array<Object>} segments with `speaker` (integer) where resolvable
*/
export function assign_speakers_to_segments( segments, turns ) {

	if (!Array.isArray(segments)) {
		return [];
	}
	const turn_list = Array.isArray(turns) ? turns : [];

	const out			= [];
	let last_speaker	= undefined;

	for (const segment of segments) {

		const start	= typeof segment.start==='number' ? segment.start : 0;
		const end	= typeof segment.end==='number' ? segment.end : start;

		const coverage = new Map();
		for (const turn of turn_list) {
			const shared = overlap_seconds( start, end, turn.start, turn.end );
			if (shared>0) coverage.set( turn.speaker, (coverage.get(turn.speaker) || 0) + shared );
		}

		let speaker		= undefined;
		let best		= 0;
		for (const [candidate, seconds] of coverage) {
			if (seconds>best || (seconds===best && speaker!==undefined && candidate<speaker)) {
				speaker	= candidate;
				best	= seconds;
			}
		}

		if (speaker===undefined) {
			speaker = last_speaker;	// continuity; undefined before the first turn
		}
		last_speaker = speaker;

		out.push( speaker===undefined
			? Object.assign({}, segment)
			: Object.assign({}, segment, { speaker: speaker }) );
	}

	return out;
}//end assign_speakers_to_segments


/**
* SPEAKER_STATS
* Summarise attributed segments per speaker for the mapping dialog: how many
* speaking turns, how long, when they first appear, and a few turn-start
* timestamps the dialog offers as "listen" jump points.
*
* @param {Array<Object>} segments - with `speaker` from assign_speakers_to_segments
* @returns {Array<Object>} [{speaker, turns, seconds, first_start, samples}]
*   sorted by first appearance
*/
export function speaker_stats( segments ) {

	if (!Array.isArray(segments)) {
		return [];
	}

	const stats			= new Map();
	let current_speaker	= null;

	for (const segment of segments) {

		const speaker = segment.speaker;
		if (speaker===undefined || speaker===null) {
			current_speaker = null;
			continue;
		}

		let entry = stats.get( speaker );
		if (entry===undefined) {
			entry = { speaker: speaker, turns: 0, seconds: 0, first_start: segment.start ?? 0, samples: [] };
			stats.set( speaker, entry );
		}

		const start	= typeof segment.start==='number' ? segment.start : 0;
		const end	= typeof segment.end==='number' ? segment.end : start;
		entry.seconds += Math.max( 0, end - start );

		// A new TURN starts when the speaker differs from the previous segment's.
		if (speaker!==current_speaker) {
			entry.turns += 1;
			if (entry.samples.length<3) {
				entry.samples.push( start );
			}
		}
		current_speaker = speaker;
	}

	return [...stats.values()].sort( (a, b) => a.first_start - b.first_start );
}//end speaker_stats


// @license-end
