<?php
//namespace PGSessions;
/**
 * Class PGSessions
 * @package PGSessions
 * Class to save PHP Sessions in Postgres database
 */
class PGSessions implements \SessionHandlerInterface
{

    private $db;

    /**
    *
    * PGSessions constructor.
    * @param $database : Provide your existing DATABASE Connected PDO Object.
    * Basically, Dependency Injection. Script EXITS if the $database provided is NOT PDO. So ensure it is.
    *
    */

    public function __construct(\PDO $database)
    {
        $this->db = NULL;
        if(($database instanceof \PDO))
        {
            $this->db = $database;
        }
        else
        {
            die('Passed database instance is NOT of the type required. Exiting');
        }
        if(!defined('SESSION_DURATION'))
        {
            define('SESSION_DURATION',86400);
            //Make Sessions valid for 1 day be default
        }
    }

    /*
    *
    * We would not be using those but it is mandatory as per SessionHandlerInterface to have the two parameters.
    * We use NULL for both
    * @param string $savePath
    * @param string $sessionName
    * @return bool
    *
    */

    public function open($savePath=NULL, $sessionName=NULL)
    {
        return true;
    }

    /**
    *
    * We could and should connections to database here in close() and return, BUT, we would be using this connection to database further, so best to keep it as it is.
    * @return bool
    *
    */

    public function close()
    {
        return true;
    }

    /**
    *
    * $session_id is passed by PHP and we fetch the "data" from database for that row and return if we find the row else, return empty string, as per Interface.
    *
    * Official PHP Documentation: The read callback must always return a session encoded (serialized) string or an empty string if there is no data to read.
    *
    * @param string $session_id
    * @return string
    *
    */

    public function read($session_id)
    {
        try
        {
            $statement = $this->db->prepare('SELECT "data" FROM "sessions" WHERE "sessions"."id"=:session_id');
            $statement->bindParam(':session_id', $session_id, \PDO::PARAM_STR);
            if ($statement->execute() && 1 === $statement->rowCount())
            {
                $row = $statement->fetch();
                return $row['data'];
            }
        }
        catch(\PDOException $error)
        {
            error_log($error);
            //Show a nice decent Database Connection Error page
            //without the details of database host, username and the password
            exit;
        }
        return '';
    }

    /**
    *
    * Writes "data" in our sessions database.
    * Uses "UPSERT", if you are using postgres < 9.5
    * you need to modify the query to
    * select, get rowCount(),
    * insert if rowCount===0 ELSE update if rowCount===1.
    * @param string $session_id
    * @param string $data
    * @return bool
    *
    */

    public function write($session_id, $data)
    {
        try
        {
            $current_time = time();
            $expiry_time = $current_time + SESSION_DURATION;

            $statement = $this->db->prepare('INSERT into "sessions"("id","last_updated","expiry","data") VALUES (:id,:last_updated,:expiry,:data)
ON CONFLICT(id) DO UPDATE SET "data"=:data,"last_updated"=:last_updated,"expiry"=:expiry WHERE "sessions"."id"=:id;');

            $statement->bindParam(':data',$data,\PDO::PARAM_STR);
            $statement->bindParam(':last_updated',$current_time,\PDO::PARAM_INT);
            $statement->bindParam(':expiry',$expiry_time,\PDO::PARAM_INT);
            $statement->bindParam(':id',$session_id,\PDO::PARAM_STR);

            if($statement->execute())
            {
                return true;
            }
        }
        catch(\PDOException $error)
        {
            error_log($error);
            //Show a nice decent Database Connection Error page
            //without the details of database host, username and the password
            exit;
        }
        return false;
    }

    /**
    *
    * Destroy session, DELETES row from "sessions" table
    * @param string $session_id
    * @return bool
    *
    */

    public function destroy($session_id)
    {
        try
        {
            $statement = $this->db->prepare('DELETE from "sessions" WHERE  "sessions"."id" = :session_id');
            $statement->bindParam(':session_id',$session_id,\PDO::PARAM_STR);
            if($statement->execute())
            {
                return true;
            }
        }
        catch(\PDOException $error)
        {
            error_log($error);
            //Show a nice decent Database Connection Error page
            //without the details of database host, username and the password
            exit;
        }
        return false;
    }

    /**
    *
    * Cleans up expired sessions.
    * Called randomly by PHP internally when a session starts or when session_start() is invoked.
    * The frequency this is called is based on
    * session.gc_divisor and session.gc_probability configuration directives.
    * @param int $maxlifetime
    * @return bool
    *
    */

    public function gc($maxlifetime=SESSION_DURATION)
    {
        try
        {
            $current_time = time();
            $statement = $this->db->prepare('DELETE from "sessions" WHERE  "sessions"."expiry" < :current_time');
            $statement->bindParam(':current_time',$current_time,\PDO::PARAM_INT);
            if($statement->execute())
            {
                return true;
            }
        }
        catch(\PDOException $error)
        {
            error_log($error);
            //Show a nice decent Database Connection Error page
            //without the details of database host, username and the password
            exit;
        }
        return false;
    }
}
