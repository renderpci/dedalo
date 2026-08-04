# Shipped ICC profiles — the CMYK→sRGB conversion pair

`engine/imagemagick.ts` (`cmykProfileArgs`) injects these two profiles into every
image recipe whose SOURCE is CMYK:

    -profile Generic_CMYK_Profile.icc -profile sRGB_Profile.icc -strip

A CMYK JPEG renders **inverted** in every browser, so the conversion is not
cosmetic: without it a CMYK print master (an ordinary heritage scan) is unusable
in the edit view and in every publication.

## Provenance

Both files are the profiles v6/v7-PHP shipped and used for the same recipe
(`core/media_engine/lib/color_profiles_icc/`, PHP `class.ImageMagick.php:408-448`
with `$profile_in = 'Generic_CMYK_Profile.icc'`). Copying them keeps the TS
recipe byte-parity with the PHP oracle rather than substituting a different
rendering intent — they are Apple's generic device profiles, redistributed here
exactly as the PHP engine redistributed them.

## Why they are IN the repo

The recipe names them by absolute path. From 2026-07-11 to 2026-08-04 the TS
engine emitted that argv while `engine/icc/` did not exist at all, and the
measured result is the worst kind of failure: ImageMagick exits 1, writes
**nothing**, and the record loses its whole derivative ladder. A recipe may not
reference a file the repo does not contain.

Gate: `test/unit/media_engine.test.ts` asserts both paths exist on disk, and
`cmykProfileArgs()` throws naming the missing profile rather than letting a
deploy fail 400 lines later as "produced no output file".
