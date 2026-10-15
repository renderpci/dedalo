---
title: "The guided install no longer refuses when you keep the default answer of an optional question."
type: fixed
audience: admin
date: 2026-10-09
---
Answering `skip` to an optional question (the default for *move the vhost logs*, asked whenever the
site's virtual host logs into the distribution's log directory, as Ubuntu's stock virtual host does;
or keeping a stale pairing package) made init stop with exit 3, *skipping leaves required items
undone: init.keep_ref*, before it changed anything. An optional question now holds nothing back: init
installs the host and leaves only that item as it is.
