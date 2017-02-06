# Express

A database of transcriptome profiles encompassing known and novel transcripts across multiple developmental stages in eye tissues in mouse

## Production server

Express is running on http://www.iupui.edu/~sysbio/express/.

## Local server

### Requirements

After setting up an environment including Apache and MySQL servers, you will need following files and operations to set up the actual local server for Express.

This repository

    cd /path/to/www # actual root directory for Apache server
    git clone https://github.com/gungorbudak/express.git

A directory called resources under root directory containing

    cd /path/to/www/express # the actual root of the cloned repository
    mkdir resources

Custom GENCODE vM7 annotation and XML files under resources directory

    cd /path/to/www/express/resources
    wget http://www.iupui.edu/~sysbio/express/resources/gencode.vM7.tgz
    tar -zxfv gencode.vM7.tgz
    rm gencode.vM7.tgz

2bit format for Mus musculus 10 reference genome (from UCSC) under resources directory

    cd /path/to/www/express/resources
    wget http://hgdownload.cse.ucsc.edu/goldenPath/mm10/bigZips/mm10.2bit

The MySQL dump of Express database

    cd /path/to/www/express/resources
    wget http://www.iupui.edu/~sysbio/express/resources/express.sql.gz
    gunzip < express.sql.gz | mysql -u user -p express
    rm express.sql.gz

After completing these steps, you should be able to see the local server for Express on http://localhost/express/.
