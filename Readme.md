<img src="http://dedalo4.antropolis.net/dedalo/images/logos/dedalo_logo.png" alt="Dédalo logo" />

**README**

*Dédalo Ver 4*

Dédalo is a knowledge management system for Cultural Heritage (tangible and intangible), Natural Heritage and Oral History/Memory. 

Dédalo is a Open Source software based in a new paradigm of programing: develop objects with a ontology model and control the app flow with the ontology descriptors, related terms, no descriptors, TG, TE, etc. The objects have a MVC structure linked to the ontology and the database is a NoSQL model. The data is stored in JSONB (binary).

Dédalo use the structure Ontology for three things:

	1. Make the data structured. (user data is stored without fixed structure)
	2. Do the programing objects in the execution time (in real time).
	3. Interpret the code and the data and translate to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc)

The ontology can be change in the time and this will change the data and the programing code; you can develop new functionalities without change the data, and you can change the metadata without change the code or the data.

Dédalo is a real multilingual app (Dédalo can use any language) in the interface and the managed data, with a multi-thesaurus and manage multiple resources and resolutions for video, image, pdf, notation scores, etc. 

Dédalo has a geo-reference for the cultural goods, interviews, etc. with points, areas, paths, etc and have a indexation and related model of multiple data sources with the thesaurus.

Dédalo can handle and cut video in real time for find thematic parts of interviews or cultural goods (fragments of interviews / cultural goods), for 4k, HD 1080, 720, 404 resolutions.

**DEMO**

You can see Dédalo in action:

<p><a href="http://dedalo4.antropolis.net/dedalo/lib/dedalo/main/?t=oh1" target="_blank">Dédalo demo</a></p>

Some projects using Dédalo to manage their Cultural Heritage or Oral Archive:

<p><strong>Projects: </strong> 

<p><a href="http://museoprehistoriavalencia.org/web_mupreva/?q=en" target="_blank">Museu de Prehistòria de València</a></p>	
<p><a href="http://bancmemorial.gencat.cat/web/home/?&amp;lang=eng" target="_blank">Memorial Democràtic</a> (Banco audiovisual de la Memoria Colectiva)</p>
<p><a href="http://www.mujerymemoria.org" target="_blank">Mujer y Memoria</a> (Woman and Memory - Mothers and daughters of the Spanish transition. An oral history project)</p>	
<p><a href="http://memorialdemocratic.gencat.cat/ca/exposicions/expcicions_virtuals/catalunya_en_transicio/" target="_blank">
	Catalonia in transition</a> (Transition in Catalonia - Memorial Democràtic)</p>
<p><a href="http://www.museudelaparaula.es" target="_blank">Museu de la Paraula</a> (Archivo de la Memoria Oral Valenciana)</p>
<p><a href="http://www.museudelaparaula.es/colecciones/?lang=es" target="_blank">Collection of funds from MUVAET</a> (Museu Valencià d'Etnologia)</p>


**DEPENDENCES**

*Required for the OS*

- PHP 5.6+
- Apache 2.2.3+
- Postgres 9.4+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication)

*libs required for the Dédalo*

- Jquery 2.2.3
- bootstrap 3.1.1
- calendar 1.25
- Captionator 0.5.1
- ffmpeg 2.6.1+
- qtfaststart 1.0
- ImageMagick 6.9+
- FullCalendar v2.3.1
- geoip2
- jshash md5 v2.2
- SWFObject v1.5
- jwplayer 5.9.2118
- leaflet 0.8
- lessphp v0.4.0
- MediaElement 2.14.2
- nvd3 1.7.1
- NodeJS 5.10.1
- paper 0.9.25
- pdfjs 1.1.1
- pdfkit
- PdfParser (2014)
- tcpdf 6.2.5
- tinymce 4.3.10
- wexflow 1.2
- videojs 3.0r2
- wkhtmltopdf 0.12.1-08b0817
- Zend: Bit
-       Exception
-       Io
-       Media
-       Mime

**INSTALLATION**

1. Download Dédalo and copy to the httpdocs of web server
2. Create a DB in PostgreSQL and name it to: dedalo_xx (you can change the xx with own name).
3. Restore the file /install/db/dedalo4_install.backup to the postgres created DB. 

		pg_restore /install/db/dedalo4_install.backup dedalo_xx

4. Download the dependences and libs for Dédalo and install it into the /lib/ folder. In some cases you need see the /lib/dedalo/config/sample.config4.php file in order to change or customize the installation.
5. Rename the /lib/dedalo/config/sample.config4.php to /lib/dedalo/config/config4.php.
6. Change the file /lib/dedalo/config/sample.config4_db.php with your DB configuration.
7. Rename the /lib/dedalo/config/sample.config4_db.php to /lib/dedalo/config/config4_db.php.
8. Run Dédalo into the browser. 
9. Fix your admin password (you can change only once), the default account is: admin (this user is a root and only for development or debuger the application).
10. Create one Administrator user account with all access to the system.(this user will be the administrator of the system)
11. Logout and login with the Administrator acount.
12. Create Users and Projects as you need.

**UPDATE**

*Please read the "Updates.md" file for specific notes, procedures, etc, of the versions.*


Dédalo have two updates procedures:


1. Update the code files (php, js, css, html, etc)
	-  Make backup of all files.
	-  Download the new files and change the files in your server
	-  You need see the new config files and put the changes into your own config files (/lib/dedalo/config4.php and /lib/dedalo/config4_db.php). If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the structure with the sections, components, list, etc
	-  Do the first update step
	-  Log-in as "superuser-developer"
	-  You will see the menu in "orange" or "red" (if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  Press the "import structure" button, if all go well you will see a "green" alert.
	-  Log-out and log-in with normal admin user.
	-  Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

3. Update the data in your instalation
	- Do the first and second update steps
	-  Log-in as "superuser-developer"
	-  You will see the menu in "orange" or "red" (if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	- If your data version is different that the "code files" version, Dédalo will show that you need update, press the «update» link and wait for notifications.
	- If all go well you will see a repport with the changes.
	- Reload the page 'Administration Tools'. Sometimes, if the update differs in several versions, you will need to update the data to each of the intermediate versions (v4.0.9 pass from v4.0.9 to -> v4.0.10, v4.0.10 to -> v4.0.11, etc) when the data and "code files" are in the same version, Dédalo will show that is consistent and stop the upgrade process.
	- Log-out and log-in with normal admin user.


**SERVER SYSTEM**

Dédalo in the server part is tested into the next Operating Systems:
- CentOS 6.5, 6.6, 7.1
- Red Hat Enterprise Linux 6.5, 6.6, 7.1
- MacOsX 10.6, 10.7, 10.8, 10.9, 10.10

All other Linux will be compatible but we don't test it.

Windows: is possible that Dédalo can run, but NO TESTED.

**USE**

Dédalo version 4, is only certificated and proved into the webkit browsers (Chrome, Safari,...). 
Is possible use Firefox but no is tested and maybe Dédalo can't run fine.

Browser	|	Version |	certificated
--------- | --------- | ---------
Chrome	|	40+ | YES - recomended
Chrome	|	30 to 40 | Deprecated (Please update as soon as posible)	 
Chrome	|	0 to 30 | NO	 
Safari	|	6+ | YES
Safari	|	3 to 5 | Deprecated (Please update as soon as posible)
Safari	|	0 to 3 | NO	 
Firefox	|	40+ | NO, but now we start to test it (29-04-2016), please feedback.
Firefox	|	0-40 | NO
IExplorer	| All 	| NO
