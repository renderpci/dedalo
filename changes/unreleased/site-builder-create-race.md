---
title: Creating a site twice at the same moment can no longer overwrite or delete the first site.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
---
When two requests created a site with the same name at nearly the same time, the second one could pass its checks while the first was still being set up. It then wrote its own settings over the finished site, and if anything later failed, it deleted the whole site folder, including the first site's work. The site folder is now claimed by exactly one request: the second request is refused with "a site with this name already exists", and the first site is left untouched.

A site folder that exists but has no `site.json` (left by a create that was interrupted, or by a site whose settings file was removed) is no longer reused. Creating a site with that name is refused with the reason `workspace_exists`, and nothing in the folder is changed. An administrator must inspect the folder and remove it before the name can be used.
