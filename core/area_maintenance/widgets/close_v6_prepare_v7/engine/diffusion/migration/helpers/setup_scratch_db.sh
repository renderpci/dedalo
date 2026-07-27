#!/usr/bin/env bash
# One-time setup for the diffusion migration test harness.
# Creates the scratch database and grants the framework's MariaDB user access to it.
# Run as the MariaDB admin (unix_socket): the OS user `render` maps to render@localhost (ALL PRIVILEGES).
#
#   bash setup_scratch_db.sh
#
set -euo pipefail

SCRATCH_DB="${1:-web_numisdata_mib_difftest}"
APP_USER="${2:-render_dev}"

mysql -urender <<SQL
CREATE DATABASE IF NOT EXISTS \`${SCRATCH_DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${SCRATCH_DB}\`.* TO '${APP_USER}'@'localhost';
FLUSH PRIVILEGES;
SELECT CONCAT('scratch db ready: ', '${SCRATCH_DB}') AS status;
SQL
