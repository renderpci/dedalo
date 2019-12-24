<?php
/*
 Example 1: 
 event::bind('blog.post.create', function($args = array())
 {
    mail('myself@me.com', 'Blog Post Published', $args['name'] . ' has been published');
});

 Example 2: 
 event::trigger('blog.post.create', $postInfo);
*/

class event
{
    public static $events = array();

    public static function trigger($event, $args = array())
    {
        if(isset(self::$events[$event]))
        {
            foreach(self::$events[$event] as $func)
            {
                call_user_func($func, $args);
            }
        }

    }

    public static function bind($event, Closure $func)
    {
        self::$events[$event][] = $func;
    }
}
?>