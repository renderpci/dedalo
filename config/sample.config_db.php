<?php

// Reviewed: 05-10-2022
//
// NOTE (layered bootstrap): database credentials can now live in /private/.env
// (outside the web root) instead of here. The bootstrap registry sources DB
// connection constants from /private/.env and emits any that this file does
// NOT already define, so:
//   - Existing installs keep working unchanged (the defines below win).
//   - New installs may leave the secret lines out of this file and set
//     DEDALO_DATABASE_CONN / DEDALO_USERNAME_CONN / DEDALO_PASSWORD_CONN /
//     MYSQL_DEDALO_* in /private/.env instead. See config/.env.dist.
// Whatever a constant ends up as, the SEC-094 sentinel guard still refuses
// sample-default secrets when DEDALO_ENFORCE_SECRET_SENTINELS=true.



// POSTGRESQL (PRIVATE DATA)
// Default PotsgreSQL connection, for investigation system
// DEDALO_DB_TYPE: string|null 'postgresql'
define('DEDALO_DB_TYPE',				'postgresql');
// DB_BIN_PATH: string '' . Ex. /usr/bin/'
define('DB_BIN_PATH',					'/usr/bin/');
// PHP_BIN_PATH: string '/usr/bin/php' . Ex. /usr/bin/php
define('PHP_BIN_PATH',					'/usr/bin/php');
// DEDALO_HOSTNAME_CONN: string|null 'localhost'
define('DEDALO_HOSTNAME_CONN',			'localhost');
// DEDALO_DB_PORT_CONN: string|null '5432'
define('DEDALO_DB_PORT_CONN',			'5432');
// DEDALO_SOCKET_CONN: string|null null . Ex '/var/pgsql-socket'
define('DEDALO_SOCKET_CONN',			null);
// DEDALO_DATABASE_CONN: string 'dedalo_mydatabase'
define('DEDALO_DATABASE_CONN',			'dedalo_mydatabase');
// DEDALO_USERNAME_CONN: string
define('DEDALO_USERNAME_CONN',			'myusername');
// DEDALO_PASSWORD_CONN: string
define('DEDALO_PASSWORD_CONN',			'mypassword');
// DEDALO_INFORMATION: string . (!) Change it to any string before install, but don't change it after install
define('DEDALO_INFORMATION',			'Dédalo install version');
// DEDALO_INFO_KEY: string . (!) Change it with any string before install, but don't change it after install
define('DEDALO_INFO_KEY',				DEDALO_ENTITY);
// SLOW_QUERY_MS: int 6000
define('SLOW_QUERY_MS',					6000);
// DEDALO_DB_MANAGEMENT: bool . Used to activate or not the management of the DDBB by Dédalo. If false, all administration tasks will need to be done manually.
define('DEDALO_DB_MANAGEMENT',			true);



// MYSQL (PUBLIC DATA)
// MySQL connection for publication
// MYSQL_DEDALO_HOSTNAME_CONN: string|null 'hostname' . Ex. 'localhost', '127.0.0.1' etc.
define('MYSQL_DEDALO_HOSTNAME_CONN',	'localhost');
// MYSQL_DEDALO_USERNAME_CONN: string 'username'
define('MYSQL_DEDALO_USERNAME_CONN',	'username');
// MYSQL_DEDALO_PASSWORD_CONN: string 'password'
define('MYSQL_DEDALO_PASSWORD_CONN',	'password');
// MYSQL_DEDALO_DATABASE_CONN: string 'web_dedalo'
define('MYSQL_DEDALO_DATABASE_CONN',	'web_dedalo');
// MYSQL_DEDALO_DB_PORT_CONN: string|null . Ex. 3306 or null for socket
define('MYSQL_DEDALO_DB_PORT_CONN',		3306);
// MYSQL_DEDALO_SOCKET_CONN: string|null . Ex. /tmp/mysql.sock if use
define('MYSQL_DEDALO_SOCKET_CONN',		null);
// MYSQL_DB_BIN_PATH: string '' . Ex. /usr/bin/' . Optional
define('MYSQL_DB_BIN_PATH',				'/usr/bin/');
