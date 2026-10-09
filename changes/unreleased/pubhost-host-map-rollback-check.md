---
title: On an nginx publication host, a media map that stops nginx at its reload is now rolled back and nginx restarted, and the panel counts a map that is not loaded as a red check.
type: fixed
audience: admin
date: 2026-10-09
wc: WC-2026-10-03-publication-hosts-widget
---
The root service that renders the shared nginx media map (`dedalo-pubhost-map`) tests every new map before nginx reloads it. On SELinux hosts nginx can still stop on the reload itself, after a test that passed. Until now the service then only reported the failure and left nginx down, with every site on that server. It now watches nginx for five seconds after the reload. If nginx is down, the service puts back the map nginx had loaded (or removes a first one), tests it, restarts nginx and checks that it runs. The push is reported as failed and the panel keeps showing the map that is actually loaded. In **Maintenance › Publication hosts** the map's state is now a check of its own, **Host media map**. It is red when the host's agent is too old for the shared map, when the host refused this work system's map, or when this work system's map is not the one nginx serves. It is green when that map is loaded or when the map is placed by hand. Before, a map that was not loaded was painted red, but it was not counted with the other checks. See [Publication host agent](./install/publication_host.md#nginx-one-media-map-for-the-host).
