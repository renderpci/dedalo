<img height="400" src="https://dedalo.dev/tpl/assets/img/logos/logo_dedalo.svg" alt="Dédalo logo" />


#### V6 transition state

The transition was complete! All supported ontologies are ready to be used in Dédalo v6.

Important!: The current version 6.2.9 will be the last version compatible with the v5 ontology model. In the next version will be removed the old ontology editor and freeze support for v5.

| ontology | state | use | interface | tools | comments | v5 compatibility until (dmy) |
| --- | --- | --- | --- | --- | --- | --- |
| dd | production | 100% | 100% | 100% |All definitions are ready | 12/10/2024 |
| rsc | production | 100% | 100% | 100% | All definitions are ready| 12/10/2024 |
| hierarchy | production | 100% | 100% | 100% | All definitions are ready | 12/10/2024 |
| ww | production | 100% | 100% | 100% | All definitions are ready | 12/10/2024 |
| oh | production | 100% | 100% | 100% | All definitions are ready | 12/10/2024 |
| numisdata | production | 100% | 100% | 100% |  All definitions are ready | 30/04/2024 |
| isad | production | 100% | 100% | 100% | All definitions are ready | 12/10/2024 |
| ich | production | 100% | 100% | 100%  | All definitions are ready | 12/10/2024 |
| tch | production | 100% | 100% | 100%  |  All definitions are ready |  not compatible |
| tchi | production | 100% | 100% | 100%  | All definitions are ready  | not compatible |
| dmm | production | 100% | 100% | 100% | All definitions are ready | 12/10/2024 |
| mdcat | production | 100% | 100% | 100% | All definitions are ready| 12/10/2024 |


## 1. What is Dédalo?

Dédalo is a knowledge management system for tangible and intangible Cultural Heritage, Natural Heritage and Oral History and Memory.

[Official Dédalo webpage](https://dedalo.dev)

Dédalo is a Free and Open Source software based on a new paradigm of programming: developing objects with an ontology model. The ontology controls the app flow with the descriptors, related terms, no descriptors, TG, TE, etc. Objects are built with a MVC structure and are linked to the ontology. The database uses a NoSQL model, storing all data in JSONB (binary) format.

Dédalo uses the structured Ontology in order to:

1. Make the data structured (user data is stored without a fixed structure).
2. Build the programming objects during execution time.
3. Interpret the code and the data to translate it to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc.).

The ontology can be modified, subsequently changing the data and the code. You can (1) develop new functionalities without changing the data and (2) alter the metadata independently of the code and the data.

Dédalo is based on a linked data model and uses a relative, multi-reference, universal locator. Such locator can find
entities, sections, components, and tags. In other words, it can locate archives (in others entities), records, fields, and part of the fields (sub-field data).

Dédalo can use any language for its user interface and the managed data. It has a multi-thesaurus engine and can manage multiple resources and resolutions for video, image, pdf, notation scores, etc.

Dédalo has a geo-reference for cultural properties, interviews... with points, areas, paths... as well as an indexation and relational model of multiple data sources within the thesaurus.

Dédalo can handle and cut video in real time to find thematic fragments of interviews or cultural goods. 4K, 1080p, 720p, and 404p resolutions are supported.

## 2. Dédalo demo

Want to see Dédalo in action?

[Dédalo demo](https://demo.dedalo.dev/)

## 3. Who uses Dédalo?

Here are some projects that use Dédalo to manage their Cultural Heritage and/or Oral Archive:

- [Freie Universität Berlin](http://www.occupation-memories.org/de/archive/index.html)
- [Moneda Ibérica catalog](https://monedaiberica.org)
- [Museu de Prehistòria de València](http://mupreva.org/home/?q=en)
- [Memorial Democràtic](https://banc.memoria.gencat.cat/en/)
- [Mujer y Memoria](https://www.mujerymemoria.org) (Woman and Memory - Mothers and daughters of the Spanish transition. An oral history project)
- [Arxiu de la Memòria Històrica de Paiporta](http://memoriahistorica.paiporta.es) Arxiu de la Memòria Històrica de Paiporta</a> Delegación de Memoria Histórica de la Diputación de Valencia
- [Nuestra Memoria](http://memoriahistorica.dival.es/recursos/archivo-memoria-historica/) Archivo de historia oral
- [Lur Azpian, Desobiratze Goiztiarrak Nafarroan| Bajo tierra, Exhumaciones tempranas en Navarra](https://exhumacionestempranas.navarra.es) (Underground Early exhumations in Navarra - Instituto Navarro de Memoria)
- [Museu de la Paraula](http://www.museudelaparaula.es) (Archivo de la Memoria Oral Valenciana)
- [Collection of funds from MUVAET](http://www.museudelaparaula.es/colecciones/?lang=es) Museu Valencià d'Etnologia

## 4. Dependencies

### 4.1. Services required for the OS

- PHP 8.3+
- Apache 2.4.6+
- PostgreSQL 16.1+
- MySQL 5.6+ (NOT MANDATORY, only for publication).

### 4.2. Libraries required for Dédalo

- flatpickr 4.6.3
- geoip2 (!)
- json-view
- leaflet 1.9+
- geoman 2.16.0
- lessphp v0.4.0
- d3
- mocha 9.2.2
- chai 4.3.3
- nvd3 1.7.1
- svgCanvas 7.2.1
- pdfjs 1.1.1
- pdfkit
- tcpdf 6.2.5
- ckeditor 5+
- wexflow 1.2

### 4.3. Libraries required for the OS
<!-- *To be installed directly in the OS (Ubuntu, Debian, MacOs X, etc.).* -->

- FFmpeg 5.0+
- FFprobe 2.6.1+ (part of FFmpeg)
- qtfaststart 1.0 (`qt-faststart` executable. Usually of FFmpeg, but not always! Be careful!)
- ImageMagick 6.9+
- [Xpdf command line tools 4.00.01+](https://www.xpdfreader.com/download.html)

## 5. Installation

### 5.1. Ready-to-use Virtual Machine

Then, you can use our ready-to-use Virtual Machine for development:

**Virtual machine with v6**

[Dedalo V6](https://dedalo.dev/docs/install/install_help/#video-guide-for-v6-installation)

### 5.2. Video-guide for installation

Then, you can follow the steps in the installation video:

V6 video installation
[Dédalo V6 installation video on Ubuntu](https://dedalo.dev/docs/install/install_help)


### 5.3. Manual installation

Then, install Dédalo manually [following this instruction(https://dedalo.dev/docs/install/#installation)], the process to install is:

1. Download Dédalo and place it under the httpdocs directory of the web server.
2. Create a database in PostgreSQL named `dedalo_xx` (you can change the `xx` as you please).
3. Rename `[...]/dedalo/config/sample.config.php` to `[...]/dedalo/config/config.php`.
4. Modify `[...]/dedalo/config/config.php` as you need. Usually, this involves the `DEDALO_ENTITY` string and the OS library paths.
5. Rename `[...]/dedalo/config/sample.config_db.php` to `[...]/dedalo/config/config_db.php`.
6. Modify `[...]/dedalo/config/config_db.php` with your database configuration.
7. Rename `[...]/dedalo/config/sample.config_core.php` to `[...]/dedalo/config/config_core.php`.
8. Rename `[...]/dedalo/config/sample.config_areas.php` to `[...]/dedalo/config/config_areas.php`.
9. Open Dédalo in the browser.
10. Follow the instructions.
11. Once the installation process is done, log in and head to the Development Area. There, update the Ontology and register all tools.
12. Create an admin user.
13. Log out and log in with the admin user.
14. Create Users and Projects as you need.

!!! warning "Updating a Beta or RC version to final version"
    If you are using Dédalo v6 beta or Release Candidate, you will need to refresh the cache control.
    Opening the web browser console and deleting the browser cache and browser indexed_DB to update it with final definitions.

## 6. Update

You can follow the instruction to [update here](https://dedalo.dev/docs/management/updates/).
In a nutshell, Dédalo has four main updates procedures:

1. Update the code files (php, js, css, html, etc.)
    - Create a backup of all files.
    - Option 1, manual update (remove old caches and files, as a clean install):
        - Download the new files and change the files in your server.
        - You will need see the new config files and put the changes into your own config files: `../dedalo/config/config.php`, `../dedalo/config/config_db.php`, `../dedalo/config/config_areas.php` and `../dedalo/config/config_core.php`.
    - Option 2 automatically (preserve old caches and files):
        - Log-in as `root` user.
        - You will see an indication, a "red" box, as vertical band in the left side of the menu.
        - Go to the Maintenance panel: *Administration->Maintenance*
        - Locate the `Check config` panel and press the `Activate maintenance mode` button
        - Locate the `Update code` panel and press the `Update Dédalo code to the latest version` button
        - Review your config files see the info into the `Check config` panel or checking the changes in `../dedalo/config/sample.config.xx.php` files. Note: is not possible change this files automatically because are the configuration files and it has specific pw and paths of the users. If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the ontology structure with the sections, components, list, etc.
    - Do the first update step
    - Log-in with any `developer` user.
    - You will see an indication, an "orange" or "red" box, as vertical band in the left side of the menu.
    - Go to the Maintenance panel: *Administration->Maintenance*
    - Locate the `Update Ontology` panel and press the `Update Dédalo ontology to the latest version` button, if all go well you will see a "green" alert.
    - Log-out and log-in with a normal admin user.

3. Update the data in your installation
    - Do the first and second update steps
    - Log-in with any `developer` user.
    - You will see an indication, an "orange" or "red" box, as vertical band in the left side of the menu.
    - Go to the Maintenance panel: *Administration->Maintenance*
    - Locate the `Update Data panel`. If your data version is different that the "code files" version, Dédalo will show that you need update, press the «update» link and wait for notifications.
    - If all go well you will see a report with the changes.
    - Reload the page `Maintenance`. Sometimes, if the update differs in several versions, you will need to update the data to each of the intermediate versions (v6.0.9 pass from v6.0.9 to -> v6.0.10, v6.0.10 to -> v6.0.11, etc) when the data and "code files" are in the same version, Dédalo will show that is consistent and stop the upgrade process.
    - Log-out and log-in with normal admin user.
    - Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" into the list of the sections for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

4. Update the tools
    - Do all previous updates
    - Log-in with any `developer` user.
    - You will see an indication, an "orange" or "red" box, as vertical band in the left side of the menu.
    - Go to the Maintenance panel: *Administration->Maintenance*
    - Locate the `Register tools` panel and press the `Register tools` button.
    - If all go well you will see a report with the changes.


## 7. Importing toponymy

1. Dédalo has a 147 official counties toponyms, and, as other thesaurus, toponymy can be import following this steps:

[Installing new hierarchies](https://dedalo.dev/docs/management/install_new_hierarchies)

## 8. Server system

The backend of Dédalo is tested in:

- Ubuntu Server 24.04 LTS or 22.04 LTS
- Debian 11.0+
- MacOs X 12.0+
- CentOS, Fedora and RedHat situation. We are no longer testing Dédalo in RedHat/CenOS/Fedora model since the CentOS project focus was shifted. The main OS to test Dédalo will be Ubuntu. RedHat/CentOS/Fedora will become part of the "all other Linux that we do not test" category.

[CentOS blog](https://blog.centos.org/2020/12/future-is-centos-stream/?utm_source=rss&utm_medium=rss&utm_campaign=future-is-centos-stream)

Any other Linux will probably be compatible, but we offer NO GUARANTEES.

Windows: Dédalo might run, but we HAVE NOT TESTED IT.

## 9. Compatible browsers

Dédalo version V6+ is only tested in chromium and webkit browsers (Chrome, Safari, Edge 77+, ...).

| Browser | Version | Compatible with Dédalo |
| --- | --- | --- |
| Chrome | 120+ | YES - recommended |
| Chrome | 110 to 119 | Deprecated (Please update as soon as possible) |
| Chrome | 0 to 110 | NO |
| Safari | 16.4+ | YES |
| Safari | 16.3 | Deprecated (Please update as soon as possible) |
| Safari | 0 to 15 | NO |
| Firefox | 115+ | YES |
| Firefox | 100 to 114 | Deprecated (Please update as soon as possible) |
| Firefox | 0-99 | NO |
| EDGE | 120+ | YES |
| EDGE |  110 to 119 | Deprecated (Please update as soon as possible) |
| EDGE |  0 to 110 | NO |
| IExplorer | All  | NO |
