# Changing root password

> See also: [Management and maintenance](index.md) · [Users, profiles and permissions](users_and_permissions.md)

## Introduction

The Dédalo root user is the most powerful administrative account, granting complete and unrestricted access to all system data and functions. Reserve this account exclusively for critical operations like installation, system updates, maintenance procedures, and diagnostic debugging.

The root user password is established during the initial installation process and is generally intended to remain permanent. There are specific scenarios, however, that may necessitate a password change, for example, during server migration or when administrative duties are reassigned to a new administrator.

## Procedure: root password reset

For security reasons, the root user is not accessible via the Dédalo web interface, and changing it is not (yet) exposed through the maintenance panel: nothing in the ordinary component-save path hashes a new password on write (`component_password`'s descriptor, `src/core/components/component_password/descriptor.ts`, is a plain string column with no save-time hashing hook). The server can only **verify** Argon2id hashes on login (`src/core/security/auth.ts`, via `Bun.password.verify`).

Until a write-side hashing hook ships, resetting root's (or any user's) password is a manual database task, requiring:

1. Server access using the GNU/Linux account created for the Dédalo installation.
2. Privileged access to the Dédalo PostgreSQL database.

### Steps

1. **Compute a fresh Argon2id hash**, using the same algorithm the server verifies against (`Bun.password`, no external tooling needed):

    ```ts
    console.log(await Bun.password.hash('my-new-root-password'));
    // => $argon2id$v=19$m=65536,t=2,p=1$...
    ```

2. **Write the hash into `matrix_users`.** The password component is `dd133`; root is `section_id = -1`. This overwrites the first stored item's value with the freshly computed hash (see `src/core/security/auth.ts` `findUserByUsername`, which reads `string->'dd133'->0->'value'`):

    ```sql
    UPDATE matrix_users
    SET string = jsonb_set(string, '{dd133,0,value}', '"$argon2id$v=19$m=65536,t=2,p=1$..."'::jsonb)
    WHERE section_tipo = 'dd128' AND section_id = -1;
    ```

3. **Log in as root** with the new password to confirm the change took effect.

!!! warning "Secure environment required"
    Before beginning this operation, ensure your Dédalo installation is not
    publicly accessible while you carry it out, to prevent unauthorized access
    during the password change.
