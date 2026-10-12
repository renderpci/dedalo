# A host set up by hand

> See also: [Install by hand](manual_install.md) · [Production install](production.md) · [Migrating a v6 install to v7](migrating_from_v6.md)

This page has moved. A host set up by hand — a new one, or a [migrated v6 installation](migrating_from_v6.md) — now follows [Install by hand](manual_install.md), which builds the same layout, units and site as the installer, one command at a time. The sections below point to where each part now lives.

## The layout

See [Install by hand › The layout](manual_install.md#the-layout). The layout of a host set up before 2026-10-12 is in [The single-unit set](manual_install.md#the-single-unit-set).

## Prepare the host

See [`host_packages`](manual_install.md#manual-host_packages), [`host_identity`](manual_install.md#manual-host_identity), [`host_runtime`](manual_install.md#manual-host_runtime) and [`host_database`](manual_install.md#manual-host_database). A migrated host skips the engine steps: see [A migrated v6 host](manual_install.md#a-migrated-v6-host).

## The units

See [Install by hand › `host_units`](manual_install.md#manual-host_units). A host that already runs `deploy/dedalo-ts.service` and its siblings: [The single-unit set](manual_install.md#the-single-unit-set).

## The web server

See [`host_web_http`](manual_install.md#manual-host_web_http), [`host_tls`](manual_install.md#manual-host_tls) and [`host_web_site`](manual_install.md#manual-host_web_site).

## Several hand-built instances on one host

See [Install by hand › Several instances by hand](manual_install.md#several-instances-by-hand).
