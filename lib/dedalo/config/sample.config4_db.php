<?php
# POSTGRESQL >= 9.4
define('DEDALO_DB_TYPE'             , 'postgresql');		# DB Type default postgresql
define('DEDALO_DB_USE_GZIP'			, true);				# Default bool true
define('DB_BIN_PATH'            	, '');					# Like /usr/pgsql_9.4/bin/
define('PHP_BIN_PATH'				, '');					# Like /usr/bin/php
define('DEDALO_HOSTNAME_CONN'		, 'localhost');			# Default localhost
define('DEDALO_DB_PORT_CONN'		, '5432');				# PostgreSQL default 5432
define('DEDALO_SOCKET_CONN'         ,  false);   			# Like '/var/pgsql-socket'
define('DEDALO_DATABASE_CONN'		, 'dedalo4_install');	# PG DB name like dedalo4_install
define('DEDALO_USERNAME_CONN'		, 'dedalo4');			# PG DB username like dedalo4
define('DEDALO_PASSWORD_CONN'		, '');					# PG DB password like Xkio67Fg_-U3b
define('DEDALO_INFORMACION'			, 'Dédalo 4 install version 2015');	# Info about instalation
?>