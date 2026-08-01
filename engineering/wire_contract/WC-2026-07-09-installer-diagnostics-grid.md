# WC-2026-07-09-installer-diagnostics-grid — installer diagnostics grid drops the PHP/Apache-only checkers (TS-owned client)

- **Date:** 2026-07-09 (TS-native install polish).
- **Decision:** the TS-native installer never runs against PHP, so its wizard
  client is a TS-OWNED divergence (like `diffusion_server_control`, WC-005),
  excluded from `scripts/sync_client.sh` (`--exclude='installer/**'`).
- **Shape before (PHP):** `render_installer.js` renders 18 diagnostic cards,
  eight of them PHP/Apache-specific (PHP Version, Memory Limit, PHP Memory, Max
  Execution Time, Apache, PHP User, GD, mbstring); `server_info` carries those
  keys.
- **Shape after (TS):** those eight cards are removed from the installer client
  grid, and `buildInstallServerInfo()` no longer emits their keys. The grid
  shows only TS-meaningful facts (System RAM, CPU Frequency, PostgreSQL, Disk
  Free Space, Platform, Server Software, ImageMagick, FFmpeg, cURL, OpenSSL);
  `cpu_mhz` is now populated from `os.cpus()`. The PHP tree keeps its own
  PHP-era installer client unchanged.
- **Gate reconciliation:** the `client_serving` byte-identity tripwire does not
  cover the installer files (only page/common/main.css), so no gate diffs these.
  No parity gate diffs the installer — no re-harvest needed.
