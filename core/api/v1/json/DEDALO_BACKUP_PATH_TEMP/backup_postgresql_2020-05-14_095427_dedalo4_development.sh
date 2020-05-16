#!/bin/bash
sleep 6s; nice -n 19 /usr/local/bin/pg_dump -h /tmp -p 5432 -U "render" -F c -b dedalo4_development  > "DEDALO_BACKUP_PATH_DB/2020-05-14_09.dedalo4_development.postgresql_-1_dbv6-0-0.custom.backup"
