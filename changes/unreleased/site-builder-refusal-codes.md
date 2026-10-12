---
title: The site builder now says why it refused, and which refusals clear by themselves.
type: changed
audience: user
date: 2026-10-11
wc: WC-2026-10-11-site-builder-reason-codes
---
Before, most refusals of the site builder tool read the same: "The site builder rejected the request". A site name already taken, a build still running, a site with no webspace, a server full of running agent turns and a missing confirmation all showed that one sentence, and none of them was marked as something to retry. Now each refusal has its own message: the name is taken, a folder for that name is still on the server, the domain belongs to another site, there is nothing to publish yet, the site has used its disk space, the server has reached its site limit, and so on. A refusal that clears by itself (another task is running on the site, too many agent turns at once) is reported as temporary, so you can try again in a moment. Permission refusals say that the site builder needs developer or administrator permission, or that the agent session belongs to another user.

For API consumers: the tool's errors are new `site_builder.*` codes (listed in the wire contract entry), the busy family moves from `site_builder.rejected` (400) to `site_builder.busy` (503, retryable), and no site-builder error carries a free-text message any more — the code and its label are the message.
