<?php
#Default PotsgreSQL connection, for investigation system
define('DEDALO_DB_TYPE'             , 'postgresql');
define('DEDALO_DB_USE_GZIP'			, true);	# Default true
define('DB_BIN_PATH'            	, '');		# Ex. /Library/PostgreSQL/9.4/bin/'
define('PHP_BIN_PATH'				, '/usr/bin/php');		# Ex. /usr/bin/php or /Applications/MAMP/bin/php/php5.6.2/bin/php
define('DEDALO_HOSTNAME_CONN'		, 'localhost');
define('DEDALO_DB_PORT_CONN'		,  '5432');
define('DEDALO_SOCKET_CONN'         ,  null);       //'/var/pgsql-socket'
define('DEDALO_DATABASE_CONN'		, 'dedalo4_XXX');
define('DEDALO_USERNAME_CONN'		, 'myusername');
define('DEDALO_PASSWORD_CONN'		, 'mypassword');
define('DEDALO_INFORMACION'			, 'Dédalo 4 install version');

#MySQL connection for publication
define('MYSQL_DEDALO_HOSTNAME_CONN'	,'hostname');
define('MYSQL_DEDALO_USERNAME_CONN'	,'username');
define('MYSQL_DEDALO_PASSWORD_CONN'	,'password');
define('MYSQL_DEDALO_DATABASE_CONN'	,'web_dedalo'); #only for Oral History
define('MYSQL_DEDALO_DB_PORT_CONN'	,'port');
define('MYSQL_DEDALO_SOCKET_CONN'	,'/.../mysql/mysql.sock');
?>