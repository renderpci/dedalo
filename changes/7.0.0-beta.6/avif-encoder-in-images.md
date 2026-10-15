---
title: The Docker image can now write AVIF, so `.avif` alternative versions of images work out of the box.
type: fixed
audience: admin
date: 2026-10-02
---
The Docker image's ImageMagick could read AVIF but not write it: the Debian package it is built on ships the AVIF decoder only. An installation that lists `avif` in `DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS` therefore had those alternative versions refused on every upload. The image now includes the AVIF encoder (`libheif-plugin-aomenc`). Docker installations get it with the next image build; on a host install, add the same package to have AVIF versions written.
