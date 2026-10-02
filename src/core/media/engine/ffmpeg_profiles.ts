/**
 * FFMPEG ENCODE PROFILES — the 37 PHP settings files as ONE typed data table.
 *
 * PHP `require`s core/media_engine/lib/ffmpeg_settings/<setting_name>.php to
 * inject flat variables ($vb,$s,$g,$vcodec,$progresivo,$gammma,$force,$ar,$ab,
 * $ac,$acodec,$target_path) into Ffmpeg::build_av_alternate_command's scope.
 * We port each file's variable values verbatim (engineering/MEDIA_SPEC.md §4.2/§9).
 *
 * `setting_name = <quality>_<standard>_<aspect>` where standard ∈ {pal,ntsc}
 * (from source fps: ≥29 → ntsc) and aspect ∈ {16x9,4x3} (from display aspect).
 * Aspect/standard tokens are omitted for the audio tiers. Only the tiers in the
 * DEDALO_AV_AR_QUALITY ladder (1080/720/576/404/240/audio) are reachable via
 * get_setting_name; the extra files (288/480/1080i/1080p) are ported for
 * fidelity but never selected by the standard ladder.
 *
 * The `gammma` lutyuv string uses the shared coefficients (y=0.97,u=1.01,v=0.98)
 * — the PHP `$gammma` triple-m typo lives only in PHP.
 *
 * DIVERGENCE from PHP (deliberate, 2026-10-02): PHP passed `$progresivo`
 * ('-vf yadif') and `$gammma` ('-vf lutyuv=…') as TWO `-vf` options. ffmpeg
 * keeps only the LAST `-vf` per output stream ("Multiple -filter/-af/-vf options
 * specified … only the last option … will be used"), so yadif was silently
 * dropped and interlaced sources were never deinterlaced. A profile now carries
 * its filters as ONE ordered chain (`videoFilters`, deinterlace first) and the
 * argv builders emit exactly one `-vf <a>,<b>` (`engine/ffmpeg.ts:videoFilterArgv`).
 */

/** One encode profile (the variables PHP's settings file injects). */
export interface FfmpegProfile {
	/** The setting_name / filename stem (e.g. '404_pal_16x9', 'audio'). */
	readonly name: string;
	/** Video bitrate (-b:v / -vb), e.g. '1024k'. Null for audio-only tiers. */
	readonly videoBitrate: string | null;
	/** Output scale WxH (-s), e.g. '720x404'. Null for audio-only tiers. */
	readonly scale: string | null;
	/** GOP / keyframe interval (-g). Null for audio-only tiers. */
	readonly gop: number | null;
	/** Video codec (-vcodec). Null for audio-only tiers. */
	readonly videoCodec: string | null;
	/**
	 * The video filter chain, in application order: `yadif` (deinterlace —
	 * absent on the 1080i tiers) then the lutyuv gamma. Bare filter specs, never
	 * '-vf' fragments: the argv builder joins them into ONE `-vf` (ffmpeg honours
	 * only the last `-vf` given). Empty for the audio tiers and the legacy 288.
	 */
	readonly videoFilters: readonly string[];
	/** Container format (-f). */
	readonly force: string;
	/** Audio sample rate (-ar). Null → the audio branch hardcodes it. */
	readonly audioRate: number | null;
	/** Audio bitrate (-ab). Null → the audio branch hardcodes it. */
	readonly audioBitrate: string | null;
	/** Audio channels (-ac). Null → the audio branch hardcodes it. */
	readonly audioChannels: number | null;
	/** Preferred AAC encoder hint (get_audio_codec MAY override at runtime). */
	readonly audioCodec: string | null;
	/** Quality sub-directory label ($target_path). */
	readonly targetPath: string;
}

/**
 * The shared lutyuv gamma filter spec (coefficients uniform across every video
 * profile). A bare filter spec — no '-vf', no shell quotes.
 */
const GAMMA_FILTER = 'lutyuv=u=gammaval(1.01):v=gammaval(0.98):y=gammaval(0.97)';
/** The deinterlace filter spec (PHP `$progresivo`, minus its '-vf'). */
const YADIF = 'yadif=deint=interlaced';

/** Build a standard video profile (the shared gamma + libx264 defaults). */
function videoProfile(
	name: string,
	videoBitrate: string,
	scale: string,
	gop: number,
	audioRate: number,
	audioBitrate: string,
	audioChannels: number,
	targetPath: string,
	deinterlace = true,
): FfmpegProfile {
	return {
		name,
		videoBitrate,
		scale,
		gop,
		videoCodec: 'libx264',
		videoFilters: deinterlace ? [YADIF, GAMMA_FILTER] : [GAMMA_FILTER],
		force: 'mp4',
		audioRate,
		audioBitrate,
		audioChannels,
		audioCodec: 'libvo_aacenc',
		targetPath,
	};
}

const PROFILE_LIST: FfmpegProfile[] = [
	// 1080 (progressive, standard ladder tier)
	videoProfile('1080_ntsc_16x9', '6656k', '1920x1080', 30, 44100, '160k', 2, '1080'),
	videoProfile('1080_ntsc', '6656k', '1920x1080', 30, 44100, '160k', 2, '1080'),
	videoProfile('1080_pal_16x9', '6656k', '1920x1080', 25, 44100, '160k', 2, '1080'),
	videoProfile('1080_pal', '6656k', '1920x1080', 25, 44100, '160k', 2, '1080'),
	// 1080i (interlaced — no deinterlace fragment) / 1080p — extra tiers, not in the ladder
	videoProfile('1080i_ntsc_16x9', '10496k', '1920x1080', 30, 44100, '256k', 2, '1080_full', false),
	videoProfile('1080i_ntsc', '10496k', '1920x1080', 30, 44100, '256k', 2, '1080_full', false),
	videoProfile('1080i_pal_16x9', '10496k', '1920x1080', 25, 44100, '256k', 2, '1080_full', false),
	videoProfile('1080i_pal', '10496k', '1920x1080', 25, 44100, '256k', 2, '1080_full', false),
	videoProfile('1080p_ntsc_16x9', '10496k', '1920x1080', 30, 44100, '256k', 2, '1080_full'),
	videoProfile('1080p_ntsc', '10496k', '1920x1080', 30, 44100, '256k', 2, '1080_full'),
	videoProfile('1080p_pal_16x9', '10496k', '1920x1080', 25, 44100, '256k', 2, '1080_full'),
	videoProfile('1080p_pal', '10496k', '1920x1080', 25, 44100, '256k', 2, '1080_full'),
	// 240
	videoProfile('240_ntsc_16x9', '384k', '428x240', 30, 24000, '28k', 1, '240'),
	videoProfile('240_ntsc_4x3', '384k', '320x240', 30, 24000, '28k', 1, '240'),
	videoProfile('240_ntsc', '384k', '428x240', 30, 24000, '28k', 1, '240'),
	videoProfile('240_pal_16x9', '384k', '428x240', 25, 24000, '28k', 1, '240'),
	videoProfile('240_pal_4x3', '384k', '320x240', 25, 24000, '28k', 1, '240'),
	videoProfile('240_pal', '384k', '428x240', 25, 24000, '28k', 1, '240'),
	// 288 (legacy: PHP file uses $b/$maxrate not $vb — carried as its effective values, target 'low')
	{
		name: '288_pal',
		videoBitrate: '256k',
		scale: '360x202',
		gop: 25,
		videoCodec: 'libx264',
		videoFilters: [],
		force: 'mp4',
		audioRate: 22050,
		audioBitrate: '32k',
		audioChannels: null,
		audioCodec: 'libvo_aacenc',
		targetPath: 'low',
	},
	// 404 (standard web default)
	videoProfile('404_ntsc_16x9', '1280k', '720x404', 30, 44100, '64k', 1, '404'),
	videoProfile('404_ntsc', '1280k', '720x404', 30, 44100, '64k', 1, '404'),
	videoProfile('404_pal_16x9', '1024k', '720x404', 25, 44100, '64k', 1, '404'),
	videoProfile('404_pal_4x3', '1024k', '540x404', 25, 44100, '64k', 1, '404'),
	videoProfile('404_pal', '1024k', '720x404', 25, 44100, '64k', 1, '404'),
	// 480 (extra tier)
	videoProfile('480_ntsc_16x9', '1024k', '854x480', 30, 44100, '128k', 2, '480'),
	videoProfile('480_ntsc_4x3', '1024k', '640x480', 30, 44100, '128k', 2, '480'),
	videoProfile('480_ntsc', '1024k', '854x480', 30, 44100, '128k', 2, '480'),
	// 576
	videoProfile('576_ntsc_16x9', '1280k', '1024x576', 30, 44100, '128k', 2, '576'),
	videoProfile('576_pal_16x9', '1536k', '1024x576', 25, 44100, '128k', 2, '576'),
	videoProfile('576_pal_4x3', '1536k', '720x576', 25, 44100, '128k', 2, '576'),
	videoProfile('576_pal', '1536k', '1024x576', 25, 44100, '128k', 2, '576'),
	// 720
	videoProfile('720_ntsc_16x9', '2968k', '1280x720', 30, 44100, '128k', 2, '720'),
	videoProfile('720_ntsc', '2968k', '1280x720', 30, 44100, '128k', 2, '720'),
	videoProfile('720_pal_16x9', '2968k', '1280x720', 25, 44100, '128k', 2, '720'),
	videoProfile('720_pal', '2968k', '1280x720', 25, 44100, '128k', 2, '720'),
	// audio-only tiers (video vars null; the audio branch hardcodes -ar/-ab/-ac)
	{
		name: 'audio',
		videoBitrate: null,
		scale: null,
		gop: null,
		videoCodec: null,
		videoFilters: [],
		force: 'mp4',
		audioRate: null,
		audioBitrate: null,
		audioChannels: null,
		audioCodec: null,
		targetPath: 'audio',
	},
	{
		name: 'audio_tr',
		videoBitrate: null,
		scale: null,
		gop: null,
		videoCodec: null,
		videoFilters: [],
		force: 'wav',
		audioRate: null,
		audioBitrate: null,
		audioChannels: null,
		audioCodec: null,
		targetPath: 'audio',
	},
];

const PROFILES: ReadonlyMap<string, FfmpegProfile> = new Map(PROFILE_LIST.map((p) => [p.name, p]));

/** Look up a profile by setting_name. Returns null when absent. */
export function getFfmpegProfile(name: string): FfmpegProfile | null {
	return PROFILES.get(name) ?? null;
}

/** All profile names (for the argv token-parity gate). */
export function ffmpegProfileNames(): string[] {
	return [...PROFILES.keys()];
}

/**
 * Compute the setting_name for a quality + source characteristics
 * (PHP Ffmpeg::get_setting_name :274). Audio tiers ignore standard/aspect.
 * standard = 'pal' | 'ntsc'; aspect = '16x9' | '4x3' | null.
 */
export function settingName(
	quality: string,
	standard: 'pal' | 'ntsc',
	aspect: '16x9' | '4x3' | null,
): string {
	if (quality === 'audio' || quality === 'audio_tr') return quality;
	const parts = [quality, standard];
	if (aspect !== null) parts.push(aspect);
	return parts.join('_');
}
