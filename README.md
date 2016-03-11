# Express

A database of transcriptome expression profiling in different eye tissues across multiple developmental stages from curated public mouse RNA-seq datasets

## Production server

Express in running on http://www.iupui.edu/~sysbio/express/.

## Requires

* jQuery 2.0.3
* Bootstrap 3.3.6
* Font Awesome 4.5.0
* d3.js 3.5.16
* spin.js 2.3.2
* Apache web server
* PHP SQLite drivers

## Setting up a local server

* Make sure you have an Apache server that can run PHP scripts and PHP SQLite drives to connect to the database.
* Clone the project into your `www` or `public_html` folder in your web server.
* Download the SQLite database into `express/` directory.
* Visit `http://localhost/express/`.
