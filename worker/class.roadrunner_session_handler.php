<?php declare(strict_types=1);

namespace Dedalo\RoadRunner;

use SessionHandlerInterface;
use Spiral\RoadRunner\KeyValue\StorageInterface;

class RoadRunnerSessionHandler implements SessionHandlerInterface
{
    private $storage;
    private $ttl;

    public function __construct(StorageInterface $storage, int $ttl = 28800)
    {
        $this->storage = $storage;
        $this->ttl = $ttl;
    }

    public function open($path, $name): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read($id): string
    {
        // AUTH-06: a storage error must not bubble as a fatal. Consistent with
        // write()/destroy(): log it and fail to an empty session (PHP's session API
        // cannot signal a hard read failure), so a transient backend outage degrades
        // to "no session" rather than a 500 — and is visible in the logs.
        try {
            return (string)$this->storage->get($id) ?: '';
        } catch (\Throwable $e) {
            error_log("RoadRunnerSessionHandler Read Error: " . $e->getMessage());
            return '';
        }
    }

    public function write($id, $data): bool
    {
        try {
            $this->storage->set($id, $data, $this->ttl);
            return true;
        } catch (\Throwable $e) {
            error_log("RoadRunnerSessionHandler Write Error: " . $e->getMessage());
            return false;
        }
    }

    public function destroy($id): bool
    {
        try {
            $this->storage->delete($id);
            return true;
        } catch (\Throwable $e) {
            error_log("RoadRunnerSessionHandler Destroy Error: " . $e->getMessage());
            return false;
        }
    }

    public function gc($max_lifetime): int|false
    {
        // RoadRunner KV/BoltDB handles expiration automatically if TTL is provided
        return 0;
    }
}
