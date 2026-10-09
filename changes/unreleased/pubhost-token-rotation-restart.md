---
title: "Rotating a publication host's token now restarts its agent."
type: fixed
audience: admin
date: 2026-10-09
---
After you remove `credentials/SERVICE_TOKEN`, `provision apply` (and a re-run of `install.sh`) mints a
new token and now restarts the running agent, which reads its token only when it starts. Before, the
agent kept the old token: the guided install failed its own health check (*publishes another pairing
fingerprint*, exit 4) and pairing again answered *pairing_mismatch* until the agent was restarted by
hand. The manual restart step is gone from *Rotating the token*.
