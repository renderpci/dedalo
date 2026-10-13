# Trial

> See also: [Installation hub](index.md) · [Docker](docker.md) · [Production install](production.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md)

The Trial route installs a complete Dédalo in containers on one machine, for an evaluation or a demonstration. It is the same engine with the same data model and features. What it leaves out is everything that protects real records.

!!! danger "Plain HTTP and no media protection: evaluation only"
    The trial stack serves **plain HTTP**, with no certificate, and has **no media access control**: every image, document and recording is readable by anyone who can reach the machine, without logging in. The installer makes you type `yes` to that before it goes on.

    Do not put records you need to keep, restricted material or personal data in a trial. A collection that is going to be used belongs on the [Production](production.md) or [Docker](docker.md) route.

## What you need

- **Docker Engine and the Compose v2 plugin** (`docker compose`, not the old `docker-compose`), with a daemon your user can reach. On macOS, Docker Desktop. The installer checks all three and tells you how to fix what is missing; it never installs Docker or changes group membership.
- **About 8 GiB free** under Docker's root directory: the engine image is about 2.5 GB and PostgreSQL about 0.7 GB, and a local image build parks about 3 GB of build cache. Below that the database restore fails part-way with `No space left on device`, so the installer refuses first. A Docker root it cannot measure (a VM, a remote daemon) skips the check.
- **Port 80 free** on the machine (and the HTTPS port you publish, `443` by default).
- **`cosign`**, if you install an official image: its signature is verified. Without `cosign`, choose a local build instead.

Check by hand first if you like:

```shell
docker --version
docker compose version     # v2 or newer
docker info                # an error here = the daemon is not running, or your user cannot reach it
```

## Run the installer

From the checkout of Dédalo ([Get Dédalo](index.md#get-dedalo)), as yourself:

```shell
sh install.sh
```

Choose **Trial** on the first screen and answer the screens in the terminal; `sh install.sh --plain` asks the same questions one per line. Give no other flag: any answer flag, `--route` included, makes the run headless, and a headless run takes every answer from its flags or an answers file (see [Command-line flags](installer_reference.md#command-line-flags)).

## The screens

| Screen | What it asks |
| --- | --- |
| **Install type** | the route, and the acknowledgement that the trial has no media protection (typed `yes`) |
| **System check** | nothing: it shows what this machine has (Docker, Compose, disk). A failed row must be fixed first |
| **Image** | where the Dédalo image comes from: an **official** registry (verified with `cosign`), a registry of your **own**, or a local **build** from this checkout. Its version is always the installer's own |
| **Containers** | the published ports (`80` and `443` by default) |
| **Identity** | the institution's short code (`entity`) and full name, the locale and the time zone. The time zone stamps every database timestamp |
| **Ontologies** | the domain ontologies: Oral history (`oh`) is built in and pre-ticked; others come from the update server, with what they declare. Also whether to use the official update servers |
| **Thesauri** | the thesauri the chosen ontologies declare, pre-ticked. Nothing else is pre-selected, and no country's toponymy. The thesauri are created empty: only `lg` and the country toponymies carry terms |
| **Languages** | the interface and data languages |
| **Publication**, **Mail** | optional: a MariaDB publication target and an SMTP relay. On this route the connections are tested inside the container, during the install |
| **Administrator** | the `root` password, typed twice and checked against the password policy |
| **Review plan** | everything that will happen, and every command — see below |

The database name, its user, the media root and the socket are fixed by the stack, and the database password is generated during the install and never shown. Every screen is described in the [installer reference](installer_reference.md#interactive-mode).

## The Review

Nothing has changed on the machine until you type `yes` here. The Review lists the answers, the ontologies in install order, the thesauri, the languages, the steps, and **every command each host step will run** — exactly the commands the run executes:

| Step | What it does |
| --- | --- |
| `stack_preflight` | checks Docker, Compose v2, the free disk, that no Dédalo instance is already here (`dedalo_private` volume), that no stack files of an earlier install are left (`.dedalo.env`, `compose.override.yaml`), and the image source |
| `stack_image` | pulls the image and verifies its signature and version label, or builds it here |
| `stack_files` | writes `.dedalo.env` (`0600`, with the generated database password) and `compose.override.yaml` into the checkout |
| `stack_database` | starts PostgreSQL and waits for it |
| `stack_engine` | runs the engine steps inside the container: the database seed, the ontologies, the thesauri, the tools, the `root` password |
| `stack_up` | starts the engine, waits for it, then starts the rest of the stack |
| `stack_health` | `/health` through nginx over plain HTTP, and the reminder that there is no media protection |

At the Review, `write <path>` (or **w** on the full screen) saves your answers as an answers file instead, with no secret in it; `sh install.sh --answers <file>` installs from it later.

## Done

When the install completes, the Done screen shows the outcome and the generated `DEDALO_SALT_STRING` **once** — keep it with your backups. Open `http://<this machine's address>/dedalo/` (add `:<port>` if you published another HTTP port) and log in as **`root`** with the password you chose.

The installer's record of this install is in `<checkout>/.dedalo-install/`. If the install stops part-way, fix the cause and run `sh install.sh --route trial --resume`; it continues from the failed step. See [Resume and abort](installer_reference.md#resuming-an-install-resume).

Then continue with [After the install](index.md#after-the-install).

## Everyday commands

Every compose command carries the same three files: the stack file, the installer's override and the environment file. Leave out `--env-file .dedalo.env` and compose resolves the built-in defaults instead of your install's values.

```shell
docker compose -f docker-compose.simple.yml -f compose.override.yaml --env-file .dedalo.env ps
docker compose -f docker-compose.simple.yml -f compose.override.yaml --env-file .dedalo.env logs -f dedalo
docker compose -f docker-compose.simple.yml -f compose.override.yaml --env-file .dedalo.env stop    # stop, keep everything
docker compose -f docker-compose.simple.yml -f compose.override.yaml --env-file .dedalo.env up -d   # start again
```

To update the image, run `./deploy/dedalo-image-update.sh --version <version>` from the checkout: it backs up the database, gets the new image from where this install took it, and rolls back on its own if the new version does not come up healthy. It is the same procedure as on the [Docker route](docker.md#upgrading).

## Removing the trial

An install that **failed or was interrupted** is undone with:

```shell
sh install.sh --route trial --abort --confirm-database dedalo
```

It removes, in reverse order, only what this install created: its containers, the volumes it created, the files it wrote and its record.

A **completed** trial is a live instance, and `--abort` never takes it apart: it stops the stack and leaves the data. To remove a finished trial, destroy it yourself — the volumes hold the database, the media and the secrets, so this deletes everything:

```shell
docker compose -f docker-compose.simple.yml -f compose.override.yaml --env-file .dedalo.env down -v
rm .dedalo.env compose.override.yaml
rm -r .dedalo-install
```

Check that nothing is left: `docker volume ls | grep dedalo_` prints nothing.

## Moving on from a trial

The installer has no conversion from a trial to another route. When you have decided, install the route you want — [Production](production.md) on a server, or [Docker](docker.md) — as a new install. On this machine, remove the trial first: the Docker route refuses a machine that already holds a Dédalo instance.

## When it fails

| Symptom | Where to look |
| --- | --- |
| `Docker is not installed`, `the Docker daemon does not answer`, `Docker Compose v2 or newer is required` | [Troubleshooting › Docker and trial refusals](troubleshooting.md#docker-and-trial-refusals) |
| `only N GiB free under …` | the same section |
| `this machine already has a Dédalo instance (volume dedalo_private)` | the same section |
| `cosign is not installed` | install `cosign`, or choose a local build |
| the install stopped at a step | fix the cause, then `--resume` — [Resuming an install](troubleshooting.md#resuming-and-undoing-an-install) |
| `port is already allocated` | another program holds port 80 or 443: stop it, or choose other ports on the Containers screen |

Everything else: [troubleshooting](troubleshooting.md).
