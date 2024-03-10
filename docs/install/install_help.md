# Visual guide

## Video-guide for V6 installation

To Install Dédalo needs a server configured with PHP, Apache, PostgreSQL, MariaDB and other libraries.

Next video show how install Dédalo in a Ubuntu Server step by step.

!!! note "About the server configuration"
    Take account that this video is a example with a very simple configuration, for ex: the install process use default `/var/www/html` directory, do not change the default apache2 vhost and do not use a web user without admin privileges. This video do not pretend to create a production server, the goal is show how install a development environment, for install a production server you will ensure that the environment is safe.

[Installing Dédalo into Ubuntu Server](https://dedalo.dev/dedalo/media/av/720/rsc35_rsc167_19.mp4)

<video controls="" poster="https://dedalo.dev/dedalo/media/av/posterframe/rsc35_rsc167_19.jpg" src="https://dedalo.dev/dedalo/media/av/720/rsc35_rsc167_19.mp4" type="video/mp4" width="100%">
</video>

Some considerations:

1. In a production installation the user has not be member of sudoers.
2. Use SSL certificate for your vhost.
3. Use strongest passwords.

## V6 ready-to-use Virtual Machine for development

If you want try Dédalo or to begin to develop tools, you can download the full operative virtual machine with a full operative Dédalo installation.

[**Download**](Dedalo_v6_Ubuntu_64-bit_Arm_Server_22.04.4_2024-03-10.vmwarevm.zip){ .md-button .md-button--primary }

This virtual machine use Ubuntu Server 22.04.4 LTS Jammy Jellyfish for ARM (arm64), PostgreSQL 16.2 and PHP 8.3, MariaDB 11.3. It has configured with 16GB of RAM and 8 cores.

!!! note "x86 version of the Virtual Machine"
    The x86 version of this virtual machine do not exist, if you want try Dédalo into x86 architecture use our previous VM with Dédalo v5 you can download it [here](https://dedalo.dev/v5). It's also possible update Dédalo to v6 following [the update from v5 manual](../update_v5/update_from_v5.md).

Dédalo creates a backups of the database automatically, it prepares the backup file to be copied to the backup system, but, for the media files you will need to configure your server to copy these files manually. We recommend using an external backup system, in another building of the server facilities to preserve data from physical problems such as fire or flood.

!!! warning "This virtual machine is NOT a production environment"
    This virtual machine is not a production server. It can be used to test or develop in local installations, but we don't recommend use it in production environment at any case. All passwords, users, databases access, codes, etc, are public(showed below this lines) and it's not safe to use it in production. Use it carefully.

The virtual machine is configured with the next users and passwords:

1. OS Ubuntu 22.04 Server.

    | Property | Value |
    | --- | --- |
    | user | root |
    | password | demo_pw |
    | user | dedalo |
    | password | demo |

    !!! note "About root user"
        ssh access for root user is deactivate as Ubuntu default config, if you want activate, enter with dedalo user, scale permissions, and change the ssh configuration.

2. PostgreSQL 16.2

    | Property | Value |
    | --- | --- |
    | Database name | dedalo_test_db|
    | user | dedalo_db |
    | password | dedalo_test& |

3. MariaDB 11.3.

    | Property | Value |
    | --- | --- |
    | Database name | web_default |
    | user | root |
    | password | mariadb11_demo |
    | **user for publication :: full access** ||
    | user | dedalo_public_admin |
    | password | dedalo_public_admin_2024& |
    | **user for public API web :: read only** ||
    | user | dedalo_public_user|
    | password | dedalo_public_2024! |

4. Dédalo v6.1.1

    | Property | Value |
    | --- | --- |
    | **User for development and maintenance** ||
    | user | root |
    | password | Dedalo_demo2024 |
    | **User for maintenance and input data** ||
    | user | admin |
    | password | Dedalo_user2024 |
    | **web API** ||
    | user | admin |
    | API Server code | My_web_access_to_api_public_code2024! |
    | API Client code | My_web_access_to_api_public_code2024! |

### Access

You can access to Dédalo in any sported browser. The virtual Machine will have a IP assigned when you implement it. use this IP to access to the Dédalo server as:

> http://127.0.0.1/

### Directories

The machine use default Ubuntu directories for Apache httpdocs:

> /var/www/html

Dédalo directory was installed in:

> /var/www/html/dedalo

Adminer is also installed in:

> /var/www/html/adminer

Web template is installed in:

> /var/www/html/web

Web API

> http://127.0.0.1/dedalo/publication/server_api/v1/docu/ui/

If you want access to data trough web API add API Client code and the database as:

> http://127.0.0.1/dedalo/publication/server_api/v1/docu/ui/?code=My_web_access_to_api_public_code2024!&db_name=web_default&lang=lg-eng

### RAM used by PHP and PostgreSQL

The virtual machine is configured for a minimum of 16GB of RAM, PHP is assigned to use 8GB and PostgreSQL is assigned to use 5GB. You can change it, but ensure that PostgreSQL `shared_buffers` is configured according the your configuration.
