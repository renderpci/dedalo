# User panel (`tool_user_admin`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_user_admin.md)

Your personal account panel, opened from your username in the header, where you view and edit your own basic data — full name, password, email and avatar — without needing access to user management.

## What it's for

Every logged-in person should be able to keep their own account details current: fix a misspelled name, rotate a password after onboarding, set a recognisable avatar. `tool_user_admin` gives you exactly that — a small panel over your **own** user record — so you can do it from the header without opening the Users section or seeing anyone else's account.

Concrete scenario: a documentalist at a museum can catalogue objects but is not allowed to administer users. They notice their displayed name is wrong and want to set a portrait and change their password. They click their name in the top bar, the panel opens showing their id, username and profile as read-only context and editable fields for the rest, and they make the fixes — never touching the Users section.

## When to use it

- You want to update your own name, password, email or profile picture.
- You do not have (or do not need) access to the Users management section.

It only ever edits **your own** account. To administer other users — create accounts, set profiles and permissions — use the Users section, which is a separate, permission-gated area.

## Where to find it

Click your **username** in the main menu header. The User admin panel opens. It is not a section or component button — it lives only behind the username link.

## Using it, step by step

1. Click your **username** in the top header bar.
2. The panel opens showing, as read-only context, your **id**, **username** and **profile**.
3. Edit the fields you can change: **full name**, **password**, **email**, and your **user image** (the image field has the upload tool, so you can upload a portrait).
4. Your changes save through the normal field save, the same as editing any record.
5. Close the panel when you are done.

## Options

There are no settings to configure — the panel simply renders your own account fields:

| Field | Editable? |
| --- | --- |
| Id | Read-only (context) |
| Username | Read-only (context) |
| Profile | Read-only (context) |
| Full name | Editable |
| Password | Editable |
| Email | Editable |
| User image | Editable (with upload) |

## Tips and gotchas

!!! tip
    Set a clear avatar and a correct full name early — they are how colleagues recognise your edits across the catalogue.

!!! warning
    Saving your changes requires that your profile grants at least **write** access to the Users section. If it does not, the panel still opens and shows the fields, but the save is refused by the ordinary permission check — there is no special case that lets a low-privilege account edit its own record regardless of its profile. If your edits will not save, ask an administrator to check your profile's Users-section permission.

!!! note
    On a shared demonstration account the panel refuses to edit, so the demo's credentials cannot be changed.

## Related

- **[AI assistant](using_assistant.md)** · **[Error report](using_error_report.md)** — other tools launched from the menu rather than from a record.
- **[Developer reference](../development/tools/reference/tool_user_admin.md)** — how the panel is built, the fields it renders, and the permission detail above.
