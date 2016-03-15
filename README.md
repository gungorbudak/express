# Express

A database of transcriptome profiles encompassing known and novel transcripts across multiple developmental stages in eye tissues in mouse

## Production server

Express will be running on http://www.iupui.edu/~sysbio/express/ soon.

## Requires

* jQuery 2.0.3
* Bootstrap 3.3.6
* Font Awesome 4.5.0
* Biodalliance 0.13
* d3.js 3.5.16
* spin.js 2.3.2
* eligrey/FileSaver.js commit#230de7d
* Apache web server
* PHP SQLite drivers

## Setting up a local server

* Make sure you have an Apache server that can run PHP scripts and PHP SQLite drivers to connect to the database.
* Clone the project into your `www` or `public_html` folder in your web server.
* Download the SQLite database into `express/` directory.
* Download the mouse genome .2bit file and GENCODE M7 annotations SQLite database into `express/resources` directory.
* Visit `http://localhost/express/`.
