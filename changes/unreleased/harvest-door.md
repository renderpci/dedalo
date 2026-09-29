---
title: Tool authors can read other sites through `harvestFetch`, a harvesting door that obeys robots.txt and paces its requests.
type: added
audience: developer
date: 2026-09-29
---
A tool that imports from another institution's site (an auction catalogue, a journal's
OAI endpoint, a publisher's PDF) can now call `harvestFetch` instead of building its own
fetch layer. For every hop of a redirect chain it re-checks the address and your host
policy, refuses a switch from https to http, and asks the site's `robots.txt` — for
images, PDFs and POSTs too. It sends one request at a time per origin, for the whole
installation, at least three seconds apart, or at the site's `Crawl-delay` or
`Retry-After` capped at one minute. It connects to the address it checked, bounds each
hop by a total and an idle timeout and a byte ceiling, and can refuse an unexpected
media type before downloading it. Its refusals carry their own codes
(`harvest.refused`, `harvest.robots_disallowed`, `harvest.robots_unavailable`,
`harvest.too_large`, `harvest.unexpected_type`), which name the site and the reason, so
a cataloguer learns why a URL was not fetched. See
[Fetching from other sites](./development/tools/server_contract.md#fetching-from-other-sites-srccoreharvestharvestts).
