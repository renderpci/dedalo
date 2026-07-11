# Maintenance mode

> See also: [Management and maintenance](index.md) · [Updates](updates/index.md)

Before a new installation or a database upgrade of the Dédalo server, it is highly recommended to change the Dédalo state to "maintenance". This prevents data changes, conflicts and user interaction with new features before they are ready.

Maintenance state closes login to all users, including general administrators; only the root user can enter the work system.

!!! note "On the TS/Bun server"
    This is ported and enforced. `set_maintenance_mode`/`set_notification`
    (`check_config` widget, `src/core/resolve/widget_request.ts`) persist to
    the TS server's own `<private>/ts_state.json` (`server_state.ts`'s
    `setServerState()`) — the TS analog of PHP's `state.php`, but a **separate
    file**: setting maintenance mode on one engine does not set it on the
    other in a coexisting install. Enforcement lives in
    `src/core/security/auth.ts`'s `login()`: while `maintenance_mode` is `true`
    in `ts_state.json`, every non-superuser login is refused with "Server
    under maintenance. Please try again later." — only `section_id = -1`
    (root) passes. Unlike PHP, the TS server does not (yet) actively delete
    existing sessions when maintenance mode is switched on; already-logged-in
    non-root users keep their session until it expires or they log out.

## Alert to users

When Dédalo switches to maintenance, all user sessions are deleted, and any logged-in user will be unable to save their work. To avoid losing work, alert all users before switching to maintenance mode.

!!! note "On the TS/Bun server"
    The `set_notification` action is ported the same way as maintenance mode
    (`check_config` widget → `ts_state.json`'s `notification` field, a string
    message or `false`/empty to disable). Note the session-deletion sentence
    above does not hold on the TS server yet (see the note in the
    introduction): logged-in sessions are left alone when you flip the flag,
    so the alert-before-maintenance workflow below is doubly worth following
    on TS until a session-purge-on-maintenance is ported.

To alert users, follow these steps:

1. Log in as `root`

2. Go to the maintenance, and locate the `Check config` panel.

    ![Check panel](assets/2052409_192635_check_status_panel.png)

3. Set an alert notification for the users.

    Write something like:
    "The system will shut down in a few minutes for maintenance updates. Please save any unsaved work and log out as soon as possible."

4. Click `Activate notification` to set the alert.

??? note "Doing it without the UI (advanced)"

    In v7 there is no `config.php` to edit — the user notification is runtime **state**. The `Activate notification` button writes `DEDALO_NOTIFICATION_CUSTOM` to `../private/state.php` for you (and clears it when you deactivate it). The legacy `$notice` / `notice_to_active_users()` config snippet no longer exists.

    If you must set it headlessly (e.g. recovery, no UI access), add the value to `../private/state.php` by its dot-path — but note this file is normally machine-written, so the UI is the supported path:

    ```php
    // ../private/state.php
    'state.notification_custom' => ['msg' => 'The system will shut down shortly for maintenance updates — please save your work and log out.', 'class_name' => 'warning'],
    ```

    **On the TS server**, the equivalent file is `<private>/ts_state.json`
    (JSON, not PHP, and machine-written by `setServerState()` in
    `src/core/resolve/server_state.ts`); the notification value is a plain
    string (or `false`):

    ```json
    // <private>/ts_state.json
    { "notification": "The system will shut down shortly for maintenance updates — please save your work and log out." }
    ```

All users will see the message in all Dédalo pages:

![alert to users](assets/20230910_115114_alert_to_user.png)

When the user see this alert the user can save his work and logout. Dédalo will work normally.

You can check what users are active in the Maintenance panel "lock components status" (press the `Refresh` button to show changes) — ported on the TS server as `dispatchLockComponentsActions` (`get_active_users`/`force_unlock_all_components`) in `src/core/resolve/widget_request.ts`.

![show active user edition](assets/20230910_120014_active_user_panel.png)

and we recommended check the activity section:

![see the activity section](assets/20230910_115817_activty.png)

The first rows will be the last users actions.

## Changing to maintenance mode

To change the Dédalo status to maintenance follow this steps:

1. log in as root.

2. Go to the maintenance panel, and locate the `Check config` panel.

    ![Check panel](assets/2052409_192635_check_status_panel.png)

3. Click the `Activate maintenance mode` button.

    This writes the maintenance-mode override `DEDALO_MAINTENANCE_MODE_CUSTOM` to `../private/state.php`.

??? note "Doing it without the UI (advanced)"

    In v7 there is no `config.php` to edit — maintenance mode is runtime **state**. The `Activate maintenance mode` button writes `DEDALO_MAINTENANCE_MODE_CUSTOM` to `../private/state.php` (and sets it back when you deactivate).

    If you must toggle it headlessly (e.g. recovery, no UI access), set the value in `../private/state.php` by its dot-path — but note this file is normally machine-written, so the UI is the supported path:

    ```php
    // ../private/state.php
    'state.maintenance_mode_custom' => true,   // false to return to normal
    ```

    **On the TS server**, the equivalent file is `<private>/ts_state.json`:

    ```json
    // <private>/ts_state.json
    { "maintenance_mode": true }
    ```

When DEDALO_MAINTENANCE_MODE is active, all user sessions will be deleted and users will be automatically logged out and unable to log in. Only the root user will be able to log in.

!!! note "On the TS/Bun server"
    Login enforcement is byte-equivalent (non-superuser logins refused while
    `maintenance_mode` is `true`), but as noted above the TS server does not
    yet force-logout already-active sessions when the flag flips — only new
    login attempts are gated.

![User login is not allowed](assets/20230910_122431_login_not_allowed.png)

