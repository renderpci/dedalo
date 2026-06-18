# Diffusion engine service units

Supervise the Bun diffusion engine so it starts at boot and restarts on crash.
Pick ONE supervisor; both the maintenance widget and the tool's auto-recover then
drive it through `service-ctl.sh`.

## Placeholders (fill in all unit files)
- `__BUN_BIN__`      absolute path to `bun` (e.g. `~/.bun/bin/bun`, `which bun`)
- `__APP_DIR__`      absolute path to `<dedalo>/diffusion/api/v1`
- `__SOCKET_PATH__`  unix socket (default `/tmp/diffusion.sock`)
- `__LOG_FILE__`     macOS only, e.g. `/tmp/dedalo-diffusion.log`

## macOS (launchd)
1. Fill placeholders in `com.dedalo.diffusion.plist`.
2. `cp com.dedalo.diffusion.plist ~/Library/LaunchAgents/`
3. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dedalo.diffusion.plist`
4. Verify: `ls -l /tmp/diffusion.sock` (appears within ~1s).

## Linux (systemd, user scope)
User scope is required so the web user (php-fpm) can start/stop the engine for
the tool's auto-recover without root.
1. Fill placeholders in `dedalo-diffusion.service`.
2. `cp dedalo-diffusion.service ~/.config/systemd/user/`
3. `systemctl --user daemon-reload && systemctl --user enable --now dedalo-diffusion`
4. Boot-start without an interactive login (servers): `sudo loginctl enable-linger <web-user>`.

## Wire it to Dedalo
In `config.php`:
```php
define('DEDALO_DIFFUSION_SERVICE_CMD', __DIR__ . '/../diffusion/service/service-ctl.sh %action%');
```
Then `service-ctl.sh {start|stop|restart|status}` controls the supervised process.
Do NOT also use `dedalo-diffusion.sh` once a supervisor owns the process — it spawns
a second, unsupervised copy that fights for the socket.
