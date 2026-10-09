---
title: "The Publication API v1 on a publication host answers again: its configuration names the release that runs."
type: fixed
audience: admin
date: 2026-10-09
breaking: true
---
The v1 configuration lives in `publication_api/v1/shared/` and is linked into every release, but
the sample it is made from found the API's files from its own location. On a publication host every
v1 request therefore failed while answering `200`, and the v1 error log said *Class "manager" not
found*. The guided install now writes the `API_ROOT` line that names the release of the script
that runs. **Action needed** on a publication host already serving v1: in
the v1 API configuration file in `publication_api/v1/shared/` (the one step 5 of the install guide
creates), replace the `API_ROOT` line with
`define('API_ROOT', dirname(get_included_files()[0], 2));`, keeping the file's owner and mode
(see [Create the API configuration files](./install/publication_host.md#5-create-the-api-configuration-files)).
