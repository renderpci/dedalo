---
title: The activity panel of the area dashboard renders user names as text.
type: security
audience: admin
date: 2026-08-19
---
That
panel lists the most active users by the name recorded in the users section.
The name was inserted into the page as markup, so a name containing HTML was
interpreted by the browser of everyone who opened the dashboard instead of
being displayed. Names — and the counts beside them — are now written as text,
as the chart legend on the same panel already did.
