<img src="https://dedalo.render.es/dedalo/images/logos/dedalo_logo.png" alt="Dédalo logo" />

**README**

*Dédalo*

**IMPORTANT: V6 ontology compatibility for V4 and V5**
*Starting today, 21-05-2020, the ontology in V4 and V5 need to be update with a new column into the "jer_dd" table named "properties", for compatibility with the upcoming V6, this new column will not affect v4 or V5 normal function but the new exported ontologies files from master will include this column in copy files. If you don't add this column to jer_dd, Dédalo will can't import the new files and you will can lost the ontology data, although you can re-build jer_dd making the import process manually.
Read the update V5.6.0*

**ATENTION: New v6_developer branch is added, the v6 is in alpha state, the deverloper branch is freeze for new features and only update for bugs or errors**

Dédalo is a knowledge management system for Cultural Heritage (tangible and intangible), Natural Heritage and Oral History/Memory. 

<p><a href="https://dedalo.dev" target="_blank">Oficial Dédalo webpage</a></p>

Dédalo is a Open Source software based in a new paradigm of programing: develop objects with a ontology model. The ontology control the app flow with the descriptors, related terms, no descriptors, TG, TE, etc. The objects are builded with a MVC structure and are linked to the ontology. The database use a NoSQL model, all data is stored in JSONB (binary).

Dédalo use the structured Ontology for three things:

	1. Make the data structured. (user data is stored without fixed structure)
	2. Build the programing objects in the execution time (in real time).
	3. Interpret the code and the data and translate to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc)

The ontology can be changed by the time and this will change the data and the programing code; you can develop new functionalities without change the data, and you can change the metadata without change the code or the data.

Dédalo is based in linked data model, and use a relative, multireference and universal locator. The locator can find:
entity, section, component, and tag. In other words, the locator can find, archives (in others entities), records, fields, and part of the fields (sub-field data).

Dédalo is a real multilingual app (Dédalo can use any language) in the interface and the managed data, has a multi-thesaurus engine and manage multiple resources and resolutions for video, image, pdf, notation scores, etc. 

Dédalo has a geo-reference for the cultural goods, interviews, etc. with points, areas, paths, etc and have a indexation and related model of multiple data sources with the thesaurus.

Dédalo can handle and cut video in real time for find thematic parts of interviews or cultural goods (fragments of interviews / cultural goods), for 4k, HD 1080, 720, 404 resolutions.

**DEMO**

You can see Dédalo in action:

<p><a href="https://dedalo.render.es/dedalo/lib/dedalo/main/?t=oh1" target="_blank">Dédalo demo</a></p>

Some projects using Dédalo to manage their Cultural Heritage or Oral Archive:

<p><strong>Projects: </strong> 
<p><a href="http://www.occupation-memories.org/de/archive/index.html" target="_blank">Freie Universität Berlin</a></p>
<p><a href="https://monedaiberica.org" target="_blank">Moneda Ibérica catalog</a></p>
<p><a href="http://museoprehistoriavalencia.org/web_mupreva/?q=en" target="_blank">Museu de Prehistòria de València</a></p>	
<p><a href="https://arxiu.memoria.gencat.cat/en/app/#/" target="_blank">Memorial Democràtic</a> (Banco audiovisual de Memoria Colectiva)</p>
<p><a href="https://www.mujerymemoria.org" target="_blank">Mujer y Memoria</a> (Woman and Memory - Mothers and daughters of the Spanish transition. An oral history project)</p>
<p><a href="http://memoriahistorica.paiporta.es" target="_blank">Arxiu de la Memòria Històrica de Paiporta</a> Delegación de Memoria Histórica de la Diputación de Valencia </p>
<p><a href="http://memoriahistorica.dival.es/recursos/archivo-memoria-historica/" target="_blank">Nuestra Memoria. Archivo de historia oral</a></p>	
<p><a href="https://exhumacionestempranas.navarra.es" target="_blank"> Lur Azpian, Desobiratze Goiztiarrak Nafarroan| Bajo tierra, Exhumaciones tempranas en Navarra </a> (Underground Early exhumations in Navarra - Instituto Navarro de Memoria)</p>
<p><a href="http://www.museudelaparaula.es" target="_blank">Museu de la Paraula</a> (Archivo de la Memoria Oral Valenciana)</p>
<p><a href="http://www.museudelaparaula.es/colecciones/?lang=es" target="_blank">Collection of funds from MUVAET</a> (Museu Valencià d'Etnologia)</p>


**DEPENDENCES**

*Required for the OS*

- PHP 7.4+
- Apache 2.4.2+
- Postgres 10.1+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication).

*libs required for the Dédalo*

Note: If you want install a basic libs dependences pre-builded and tested, you can use the pack in:
	/install/library_packs/Dedalo_basic_library_pack_2019.zip
un zip the file and move th libraries to:
	/dedalo/lib/ 

- Jquery 2.2.3
- bootstrap 3.1.1
- calendar 1.25
- Captionator 0.5.1
- FullCalendar v2.3.1
- geoip2
- jshash md5 v2.2
- json-logic
- leaflet 1.0
- lessphp v0.4.0
- nvd3 1.7.1
- paper 0.9.25
- pdfjs 1.1.1
- pdfkit
- PdfParser (2014)
- tcpdf 6.2.5
- tinymce 4.3.10
- wexflow 1.2

Some libraries like ffmpeg or ImageMagick need to be install direclly in the system (CentOs, Debian, MacOs X, etc)

SO libraries:
- ffmpeg 2.6.1+
- qtfaststart 1.0
- ImageMagick 6.9+
- ffprobe 2.6.1+
- NodeJS 5.10.1
- Xpdf 4.00.01+
- wkhtmltopdf 0.12.1-08b0817


**INSTALLATION**

1. Download Dédalo and copy to the httpdocs of web server
2. Create a DB in PostgreSQL and name it to: dedalo_xx (you can change the xx with own name).
3. Restore the plain sql file /install/db/dedalo4_install.pgsql (from zip version) to the postgres created DB. 

        Basic psql command:
        psql --dbname=XXX --file "/install/db/dedalo4_install.pgsql"

        Example of actual use:
        psql --echo-errors --dbname=XXX --file "/install/db/dedalo4_install.pgsql"

4. Download the dependences and libs for Dédalo and install it into the /lib/ folder. In some cases you need see the /lib/dedalo/config/sample.config4.php file in order to change or customize the installation.
5. Rename the /lib/dedalo/config/sample.config4.php to /lib/dedalo/config/config4.php.
6. Change the file /lib/dedalo/config/sample.config4_db.php with your DB configuration.
7. Rename the /lib/dedalo/config/sample.config4_db.php to /lib/dedalo/config/config4_db.php.
8. Run Dédalo into the browser. 
9. Fix your root password (you can change it only once), the default account is: root (this user is a superuser and only for development or debuger the application).
10. Create one Administrator user account with all access to the system. This user will be the administrator of the system.
11. Logout and login with the Administrator acount.
12. Create Users and Projects as you need.
Optional: Import the toponymy that you will need (Dédalo install DB will not provide specific toponymy by default anymore).

**UPDATE**

*Please read the "Updates.md" file for specific notes, procedures, etc, of the versions.*

Dédalo have three main updates procedures:

1. Update the code files (php, js, css, html, etc)
	-  Make backup of all files.
	-  Download the new files and change the files in your server
	-  You will need see the new config files and put the changes into your own config files (/lib/dedalo/config4.php and /lib/dedalo/config4_db.php) is not possible change this files automatically because are the configuration files and it has specific pw and paths of the users. If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the ontology structure with the sections, components, list, etc
	-  Do the first update step
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  Press the "import structure" button, if all go well you will see a "green" alert.
	-  Log-out and log-in with a normal admin user.

3. Update the data in your instalation
	-  Do the first and second update steps
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  If your data version is different that the "code files" version, Dédalo will show that you need update, press the «update» link and wait for notifications.
	-  If all go well you will see a repport with the changes.
	-  Reload the page 'Administration Tools'. Sometimes, if the update differs in several versions, you will need to update the data to each of the intermediate versions (v4.0.9 pass from v4.0.9 to -> v4.0.10, v4.0.10 to -> v4.0.11, etc) when the data and "code files" are in the same version, Dédalo will show that is consistent and stop the upgrade process.
	-  Log-out and log-in with normal admin user.
	-  Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" into the list of the sections for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

**IMPORT TOPONYMY**

1. first create the toponymy into the Hierarchy menu into Thesaurus:
	-  Login in Dédalo
	-  Go to "Thesaurus -> Hierarchy" section
	-  Find the country that you want import
	-  Edit the country
	-  Change the "active" field to "Yes"
	-  Press the "Generate" button

2. Now the toponymy is ready for import the data in SQL.

 	-  Logout Dédalo
 	-  Go to: /dedalo/install/import/hierarchy
 	-  Select the hierarchies to be imported with the postgreSQL copy comand, similar to:
		-  psql dedalo4_XXX -U YYY -p 5432 -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from es1.copy "

		-  XXX: the name of your installation
		-  YYY: the name of your user
	-  You can list all exported tables and change the "es1.copy" to the hierarchies that you want import
	-  When you are import the toponymy data, you will need change the counters of the tables that you were imported.
	-  Login to Dédalo with developer user
	-  Go to the "administation tool" and see the:
		-  DEDALO COUNTERS STATE
	-  You will see the diferences and Dédalo show the SQL command to apply into the postgreSQL, similar to this:
		-  UPDATE "matrix_counter" SET dato = 75845 WHERE tipo = 'es1'; 
	-  This command will change the counters to the new imported values in SQL
	-  Change the profiles to acces users to the new hierarchy.

	Done! you new hierarchy was imported and ready to use.


**SERVER SYSTEM**

Dédalo in the server part is tested into the next Operating Systems:
- Ubuntu Server 16.04+
- Debian 9.0+
- MacOsX 10.12+, 11.0+
- CentOS, Fedora and RedHat situation. We are stoping Dédalo testing into RedHat/CenOS/Fedora model due CentOS project focus was changed. The main OS will be Ubuntu to test Dédalo. RedHat/CentOS/Fedora will become to the category of "all other linux that we don't test it".
<p><a href="https://blog.centos.org/2020/12/future-is-centos-stream/?utm_source=rss&utm_medium=rss&utm_campaign=future-is-centos-stream" target="_blank">CentOS blog</a></p>

All other Linux will be compatible but we don't test it.

Windows: is possible that Dédalo can run, but we NO TESTED.

**USE**

Dédalo version v4+, is only certificated and proved into the chromium or webkit browsers (Chrome, Safari, ...). 
Firefox situation: From the 4.8 version of Dédalo is full compatible with Firefox, and can be used in production, but we need more feedback from the users, please comment your experience. 

Browser	|	Version |	certificated
--------- | --------- | ---------
Chrome	|	70+ | YES - recomended
Chrome	|	60+ | Deprecated (Please update as soon as posible)	 
Chrome	|	0 to 60 | NO	 
Safari	|	10+ | YES
Safari	|	9 | Deprecated (Please update as soon as posible)
Safari	|	0 to 8 | NO	
Firefox	|	60+ | YES
Firefox	|	50 | Deprecated (Please update as soon as posible)
Firefox	|	40-49 | NO
Firefox	|	0-40 | NO
EDGE	|	77+ | YES
EDGE	| All before 2019 (v45)	| For us NO, we don't test it. is possible that Dédalo run fine in the previous versions,  Microsoft say that EDGE is ECMA and HTML5 standards compatible.
IExplorer	| All 	| NO
