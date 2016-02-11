<?php







# PREDIS SESSION MANAGER
if(DEDALO_CACHE_MANAGER=='redis') {

    # CACHE CLASS
    require_once(DEDALO_LIB_BASE_PATH.'/cache/class.cache.php');
    # Init cache generate static cache::$instance
    new cache();

    # Avoid use redis to sessions in debug mode
    #if (DEDALO_ENTITY=='development') {
        return;
    #}

    # SESSIONS HANDLER
    #$handler = new Predis\Session\SessionHandler($redis_client, array('gc_maxlifetime' => 5));
    $handler = new Predis\Session\SessionHandler(cache::$instance);
    # Register our session handler (it uses `session_set_save_handler()` internally).
    $handler->register();

    return;


        # Include PREDIS LIB
        require( dirname(dirname(dirname(dirname(__FILE__)))) . '/lib/predis/examples/SharedConfigurations.php' );
/*

        // This example demonstrates how to leverage Predis to save PHP sessions on Redis.
        //
        // The value of `session.gc_maxlifetime` in `php.ini` will be used by default as the
        // the TTL for keys holding session data on Redis, but this value can be overridden
        // when creating the session handler instance with the `gc_maxlifetime` option.
        //
        // Note that this class needs PHP >= 5.4 but can be used on PHP 5.3 if a polyfill for
        // SessionHandlerInterface (see http://www.php.net/class.sessionhandlerinterface.php)
        // is provided either by you or an external package like `symfony/http-foundation`.
        if (!interface_exists('SessionHandlerInterface')) {
            die("ATTENTION: the session handler implemented by Predis needs PHP >= 5.4.0 or a polyfill ".
                "for \SessionHandlerInterface either provided by you or an external package.\n");
        }

        // Instantiate a new client just like you would normally do. We'll prefix our session keys here.
        $redis_client = new Predis\Client($single_server, array('prefix' => 'sessions:'));

        // Set `gc_maxlifetime` so that a session will be expired after 5 seconds since last access.
        #$handler = new Predis\Session\SessionHandler($redis_client, array('gc_maxlifetime' => 5));
        $handler = new Predis\Session\SessionHandler($redis_client);

        // Register our session handler (it uses `session_set_save_handler()` internally).
        $handler->register();
*/


# MEMCACHED SESSION MANAGER
}elseif(DEDALO_CACHE_MANAGER=='memcached') {

        /*
        $memcache_host = '127.0.0.1';
        $memcache_port = '11211';

        $session_save_path = "tcp://$memcache_host:$memcache_port?persistent=1&weight=2&timeout=2&retry_interval=10,  ,tcp://$memcache_host:$memcache_port  ";
        ini_set('session.save_handler', 'memcache');
        ini_set('session.save_path', $session_save_path);
        */
        ini_set('session.save_handler'  , 'memcached');
        ini_set('session.save_path'     , "127.0.0.1:11211");

        /*
        # Connect to memcache:
        global $memcache;
        $memcache = new Memcache;

        # Gets key / value pair into memcache ... called by mysql_query_cache()
        function getCache($key) {
            global $memcache;
            return ($memcache) ? $memcache->get($key) : false;
        }

        # Puts key / value pair into memcache ... called by mysql_query_cache()
        function setCache($key,$object,$timeout = 60) {
            global $memcache;
            return ($memcache) ? $memcache->set($key,$object,MEMCACHE_COMPRESSED,$timeout) : false;
        }

        # Caching version of mysql_query()
        function mysql_query_cache($sql,$linkIdentifier = false,$timeout = 60) {
            if (($cache = getCache(md5("mysql_query" . $sql))) !== false) {
                $cache = false;
                $r = ($linkIdentifier !== false) ? mysql_query($sql,$linkIdentifier) : mysql_query($sql);
                if (is_resource($r) && (($rows = mysql_num_rows($r)) !== 0)) {
                    for ($i=0;$i<$rows;$i++) {
                        $fields = mysql_num_fields($r);
                        $row = mysql_fetch_array($r);
                        for ($j=0;$j<$fields;$j++) {
                            if ($i === 0) {
                                $columns[$j] = mysql_field_name($r,$j);
                            }
                            $cache[$i][$columns[$j]] = $row[$j];
                        }
                    }
                    if (!setCache(md5("mysql_query" . $sql),$cache,$timeout)) {
                        # If we get here, there isn't a memcache daemon running or responding
                    }
                }
            }
            return $cache;
        }
        */

# ZEBRA_DB SESSION MANAGER
}elseif(DEDALO_CACHE_MANAGER=='zebra_db') {

        // try to connect to the MySQL server
        #$link = mysqli_connect(DEDALO_HOSTNAME_CONN, DEDALO_USERNAME_CONN, DEDALO_PASSWORD_CONN, DEDALO_DATABASE_CONN) or die('Could not connect to database!');
        require_once(DEDALO_LIB_BASE_PATH . '/config/config4_db.php');        
        #require_once(DEDALO_LIB_BASE_PATH . '/config/class.Error.php');
        $link = DBi::_getConnection();

        // include the Zebra_Session class
        require DEDALO_ROOT.'/lib/Zebra_Session-master/Zebra_Session.php';

        // instantiate the class
        // note that you don't need to call the session_start() function
        // as it is called automatically when the object is instantiated
        // also note that we're passing the database connection link as the first argument
        $session = new Zebra_Session($link, 'sEcUr1tY_c0dE_ofDd4_zcpoJ2');
        /*
        // current session settings
        print_r('<pre><strong>Current session settings:</strong><br><br>');
        print_r($session->get_settings());
        print_r('</pre>');

        // from now on, use sessions as you would normally
        // the only difference is that session data is no longer saved on the server
        // but in your database

        print_r('
            The first time you run the script there should be an empty array (as there\'s nothing in the $_SESSION array)<br>
            After you press "refresh" on your browser, you will se the values that were written in the $_SESSION array<br>
        ');

        print_r('<pre>');
        print_r($_SESSION);
        print_r('</pre>');

        // add some values to the session
        $_SESSION['value1'] = 'hello';
        $_SESSION['value2'] = 'world';
        */
}
?>
