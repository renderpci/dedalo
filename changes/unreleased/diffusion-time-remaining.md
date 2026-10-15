---
title: The publication server panel shows an estimated time remaining for the running jobs.
type: added
audience: admin
date: 2026-10-14
---
In Maintenance → Diffusion server control, the *Live activity* band now shows next
to the progress bar roughly how long it will be until the running publication jobs
finish (for example "~12 min remaining (estimated)"). It is measured in your browser
from how fast each running job has moved over the last few minutes. It appears a few
seconds after live updates start, grows if a job stalls, and leaves out queued jobs and
jobs queued without a record estimate.
