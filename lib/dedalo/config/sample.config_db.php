<?php

# Reviewed: 12-05-2018

# POSTGRESQL (PRIVATE DATA)
# Default PotsgreSQL connection, for investigation system
define('DEDALO_DB_TYPE'             , 'postgresql');
define('DEDALO_DB_USE_GZIP'			, true);			# Default true
define('DB_BIN_PATH'            	, '');				# Ex. /Library/PostgreSQL/9.4/bin/'
define('PHP_BIN_PATH'				, '/usr/bin/php');	# Ex. /usr/bin/php
define('DEDALO_HOSTNAME_CONN'		, 'localhost');
define('DEDALO_DB_PORT_CONN'		,  '5432');
define('DEDALO_SOCKET_CONN'         ,  null);       	# Like '/var/pgsql-socket' if use
define('DEDALO_DATABASE_CONN'		, 'dedalo4_XXX');
define('DEDALO_USERNAME_CONN'		, 'myusername');
define('DEDALO_PASSWORD_CONN'		, 'mypassword');
define('DEDALO_INFORMACION'			, 'Dédalo install version');

# MYSQL (PUBLIC DATA)
# MySQL connection for publication
define('MYSQL_DEDALO_HOSTNAME_CONN'	,'hostname');		# Like localhost, 127.0.0.1 etc.
define('MYSQL_DEDALO_USERNAME_CONN'	,'username');
define('MYSQL_DEDALO_PASSWORD_CONN'	,'password');
define('MYSQL_DEDALO_DATABASE_CONN'	,'web_dedalo'); 	# Only for Oral History
define('MYSQL_DEDALO_DB_PORT_CONN'	,'port'); 			# like 3306 or null for socket
define('MYSQL_DEDALO_SOCKET_CONN'	,'/tmp/mysql.sock'); # Like /tmp/mysql.sock if use
?>