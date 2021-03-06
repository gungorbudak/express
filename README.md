# Express

A database of transcriptome profiles encompassing known and novel transcripts across multiple developmental stages in eye tissues in mouse

## Production server

Express is running on https://sysbio.sitehost.iu.edu/express/.

## Local server

### Requirements

After setting up an environment including Apache and MySQL servers, you will need following files and operations to set up the actual local server for Express.

1. This repository

        cd /path/to/www # actual root directory for Apache server
        git clone https://github.com/gungorbudak/express.git

2. Change the base URL at 4th line of `assets/js/app.js` into localhost

        perl -pi -e "s/sysbio\.sitehost\.iu\.edu\//localhost/g" path/to/www/express/assets/js/app.js

3. A directory called `resources` under root directory

        cd /path/to/www/express # actual root of the cloned repository
        mkdir resources

4. Custom GENCODE vM7 annotation and XML files under resources directory

        cd /path/to/www/express/resources
        wget https://sysbio.sitehost.iu.edu/express/resources/gencode.vM7.tgz
        tar -zxfv gencode.vM7.tgz
        rm gencode.vM7.tgz

5. 2bit format for Mus musculus 10 reference genome (from UCSC) under resources directory

        cd /path/to/www/express/resources
        wget http://hgdownload.cse.ucsc.edu/goldenPath/mm10/bigZips/mm10.2bit

6. The MySQL dump of Express database

        cd /path/to/www/express/resources
        wget https://sysbio.sitehost.iu.edu/express/resources/express.sql.gz
        gunzip < express.sql.gz | mysql -u user -p express
        rm express.sql.gz

After completing these steps, you should be able to see the local server for Express on http://localhost/express/.
