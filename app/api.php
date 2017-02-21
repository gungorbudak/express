<?php

    /*

    Express API
    Author: Gungor Budak, gngrbdk@gmail.com

    MySQL queries

    CREATE DATABASE express;

    CREATE TABLE gene (
        ensembl_gene_id CHAR(25) NOT NULL,
        mgi_gene_id CHAR(25) NOT NULL,
        chr_name CHAR(5) NOT NULL,
        start INT(11) NOT NULL,
        end INT(11) NOT NULL,
        PRIMARY KEY (ensembl_gene_id),
        INDEX name (ensembl_gene_id, mgi_gene_id, chr_name, start, end)
    );

    CREATE TABLE synonym (
        gene_synonym CHAR(25) NOT NULL,
        gene_name CHAR(25) NOT NULL,
        ensembl_gene_id CHAR(25) NOT NULL,
        PRIMARY KEY (gene_synonym),
        FOREIGN KEY (ensembl_gene_id) REFERENCES GENE(ensembl_gene_id)
    );

    CREATE TABLE transcript (
        ensembl_transcript_id CHAR(25) NOT NULL,
        ensembl_gene_id CHAR(25) NOT NULL,
        PRIMARY KEY (ensembl_transcript_id),
        FOREIGN KEY (ensembl_gene_id) REFERENCES GENE(ensembl_gene_id)
    );

    CREATE TABLE sample (
        sample_id CHAR(25) NOT NULL,
        dev_stage CHAR(5) NOT NULL,
        tissue_type CHAR(25) NOT NULL,
        bioproject_id CHAR(25) NOT NULL,
        pubmed_id CHAR(25) NOT NULL,
        reference CHAR(255) NOT NULL,
        PRIMARY KEY (sample_id),
        INDEX name (sample_id, dev_stage, tissue_type)
    );

    CREATE TABLE expression (
        transcript_id CHAR(25) NOT NULL,
        sample_id CHAR(25) NOT NULL,
        chr_name CHAR(5) NOT NULL,
        start INT(11) NOT NULL,
        end INT(11) NOT NULL,
        tpm_raw DOUBLE PRECISION NOT NULL,
        tpm_normalized DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (transcript_id, sample_id),
        INDEX name (transcript_id, sample_id, chr_name, start, end)
    );

    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express tables_revised/gene.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express tables_revised/synonym.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express tables_revised/transcript.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express tables_revised/sample.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express tables_revised/expression.tsv

    */

    // this PHP file has an array like following
    // kept separate for security reasons
    require_once 'config.php';
    /*
    <?php
        $config = array(
            'host' => 'host',
            'port' => port,
            'dbname' => 'dbname',
            'user' => 'user',
            'pass' => 'pass'
        );
    ?>
    */

    /*
    Sanitizing user input
    */
    function sanitize($query) {
        return trim(htmlspecialchars(strip_tags($query)));
    }

    /*
    Searching strings starting with $needle
    Adapted from http://stackoverflow.com/a/10473026
    */
    function starts_with($haystack, $needle) {
        $haystack = strtolower($haystack);
        $needle = strtolower($needle);
        // search backwards starting from haystack length characters from the end
        return $needle === "" || strrpos($haystack, $needle, -strlen($haystack)) !== false;
    }

    /*
    Parsing query and identfying if the search is using location
    or any other identifier like gene name, transcript ID
    */
    function parse_query($query) {
        // setting type of the query
        if (starts_with($query, 'ENSMUSG')) {
            $type = 'ensembl_gene_id';
        } elseif (starts_with($query, 'MGI:')) {
            $type = 'mgi_gene_id';
        } elseif (starts_with($query, 'ENSMUST')) {
            $type = 'ensembl_transcript_id';
        } else {
            $type = 'gene_synonym';
        }
        $parsed = array(
            'is_location' => false,
            'type' => $type,
            'query' => strtoupper($query)
        );
        if (preg_match('/^(.*):(.*)-(.*)$/i', $query, $match)) {
            $parsed['is_location'] = true;
            $parsed['type'] = 'location';
            $parsed['query'] = array(
                'chr_name' => $match[1],
                'start' => intval($match[2]),
                'end' => intval($match[3])
            );
        }
        return $parsed;
    }

    function get_expression($parsed, $tissue_type, $cutoff, $db) {
        $transcript_ids = array();
        $results = array();
        // collect transcript IDs
        if ($parsed['is_location'] === true) {
            // if a location is given
            $stmt = $db->prepare("SELECT
                expression.transcript_id AS transcript_id
                FROM expression, sample
                WHERE expression.sample_id = sample.sample_id
                AND sample.tissue_type = :tissue_type
                AND expression.chr_name = :chr_name
                AND expression.start < :end
                AND expression.end > :start
                GROUP BY sample.dev_stage, expression.transcript_id");
            $stmt->execute(array(
                ':tissue_type' => $tissue_type,
                ':chr_name' => $parsed['query']['chr_name'],
                ':start' => $parsed['query']['start'],
                ':end' => $parsed['query']['end'],
            ));
            // fetch all distinct transcript IDs as single dimensional array
            $transcript_ids = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
        } else {
            /*
            if any of the following is given:
                gene synonym
                MGI gene ID
                Ensembl gene ID
                Ensembl transcript ID
            */
            if ($parsed['type'] == 'ensembl_gene_id') {
                $stmt = $db->prepare("SELECT
                    transcript.ensembl_transcript_id as transcript_id
                    FROM gene, transcript
                    WHERE gene.ensembl_gene_id = transcript.ensembl_gene_id
                    AND gene.ensembl_gene_id = :query
                    GROUP BY transcript.ensembl_transcript_id");
            } elseif ($parsed['type'] == 'mgi_gene_id') {
                $stmt = $db->prepare("SELECT
                    transcript.ensembl_transcript_id as transcript_id
                    FROM gene, transcript
                    WHERE gene.ensembl_gene_id = transcript.ensembl_gene_id
                    AND gene.mgi_gene_id = :query
                    GROUP BY transcript.ensembl_transcript_id");
            } elseif ($parsed['type'] == 'ensembl_transcript_id') {
                $stmt = $db->prepare("SELECT
                    transcript.ensembl_transcript_id as transcript_id
                    FROM transcript
                    WHERE transcript.ensembl_transcript_id = :query");
            } else {
                $stmt = $db->prepare("SELECT
                    transcript.ensembl_transcript_id as transcript_id
                    FROM transcript, gene, synonym
                    WHERE gene.ensembl_gene_id = transcript.ensembl_gene_id
                    AND gene.ensembl_gene_id = synonym.ensembl_gene_id
                    AND synonym.gene_synonym = :query
                    GROUP BY transcript.ensembl_transcript_id");
            }
            $stmt->execute(array(
                ':query' => $parsed['query']
            ));
            // fetch all distinct transcript IDs as single dimensional array
            $transcript_ids = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
        }
        // get expression data using collected transcript IDs
        $count = count($transcript_ids);
        if ($count > 0) {
            $in = join(',', array_pad(array(), $count, '?'));
            $params = $transcript_ids;
            array_unshift($params, $tissue_type);
            array_push($params, $cutoff);
            // fetch for those transcript IDs TPMs
            $stmt = $db->prepare("SELECT
                synonym.gene_name AS gene,
                transcript.ensembl_transcript_id AS transcript,
                sample.dev_stage AS stage,
                AVG(expression.tpm_raw) AS value_raw,
                AVG(expression.tpm_normalized) AS value_normalized,
                CONCAT(expression.chr_name, ':', expression.start, '-', expression.end) AS location
                FROM transcript, gene, synonym, sample, expression
                WHERE transcript.ensembl_transcript_id = expression.transcript_id
                AND sample.sample_id = expression.sample_id
                AND gene.ensembl_gene_id = transcript.ensembl_gene_id
                AND gene.ensembl_gene_id = synonym.ensembl_gene_id
                AND sample.tissue_type = ?
                AND transcript.ensembl_transcript_id IN ($in)
                GROUP BY sample.dev_stage, transcript.ensembl_transcript_id
                HAVING AVG(expression.tpm_normalized) > ?");
            $stmt->execute($params);
            // fetch expression values
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            // sort the results by developmental stage
            usort($results, function($a, $b) {
                return strnatcmp($a['stage'], $b['stage']);
            });
        }
        return $results;
    }

    function normalize_row($results) {
        // find the maximum normalized values for each transcript or row
        $max_vals = array();
        foreach ($results as $result) {
            if (array_key_exists($result['transcript'], $max_vals)) {
                if ($max_vals[$result['transcript']] < floatval($result['value_normalized'])) {
                    $max_vals[$result['transcript']] = floatval($result['value_normalized']);
                }
            } else {
                $max_vals[$result['transcript']] = floatval($result['value_normalized']);
            }
        }
        $data = array();
        foreach ($results as $result) {
            // normalize the value in value_normalized key
            if ($max_vals[$result['transcript']] > 0) {
                $result['value'] = floatval($result['value_normalized']) / $max_vals[$result['transcript']];
            } else {
                $result['value'] = floatval($result['value_normalized']);
            }
            $data[] = $result;
        }
        return $data;
    }

    function get_location($parsed, $db) {
        /*
        if any of the following is given:
            Ensembl gene ID
            MGI gene ID
            Ensembl transcript ID
            Gene synonym
        */
        if ($parsed['type'] == 'ensembl_gene_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene
                WHERE gene.ensembl_gene_id = :query");
        } elseif ($parsed['type'] == 'mgi_gene_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene
                WHERE gene.mgi_gene_id = :query");
        } elseif ($parsed['type'] == 'ensembl_transcript_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene, transcript
                WHERE gene.ensembl_gene_id = transcript.ensembl_gene_id
                AND transcript.ensembl_transcript_id = :query
                GROUP BY transcript.ensembl_transcript_id");
        } else {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene, synonym
                WHERE gene.ensembl_gene_id = synonym.ensembl_gene_id
                AND synonym.gene_synonym = :query");
        }
        $stmt->execute(array(
            ':query' => strtoupper($parsed['query'])
        ));
        $location = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return $location[0];
    }

    $query = (isset($_GET['query']) === true) ? sanitize($_GET['query']) : '';
    $cutoff = (isset($_GET['cutoff']) === true) ? floatval(sanitize($_GET['cutoff'])) : 1;
    $tissue = (isset($_GET['tissue']) === true) ? sanitize($_GET['tissue']) : '';
    $format = (isset($_GET['format']) === true) ? sanitize($_GET['format']) : 'json';
    if ($query !== '') {

        // try connecting to the database
        try {
            $db = new PDO(
                'mysql:host='. $config['host'] .';port='. $config['port'] .';dbname='. $config['dbname'],
                $config['user'], $config['pass']
                );
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $e) {
            header('Content-Type: application/json');
            echo json_encode(array('error' => 'DB operation failed with the following error: ' . $e->getMessage()));
            die();
        }

        // if location is asked
        if ($format == 'location') {
            $parsed = parse_query($query);
            $location = get_location($parsed, $db);
            header('Content-Type: application/json');
            echo json_encode($location);
            die();
        }

        // if getting expression data
        if ($tissue !== '') {
            // parsing query for identifying location search
            $parsed = parse_query($query);
            // query the database and obtain required fields
            $results = get_expression($parsed, $tissue, $cutoff, $db);
            // normalize results
            $results = normalize_row($results);
            if ($format == 'json') {
                // return the JSON format of the data
                header('Content-Type: application/json');
                echo json_encode($results);
                die();
            } else if ($format == 'tsv') {
                if (count($results) > 0) {
                    // write the header
                    echo implode("\t", array(
                        'gene_name',
                        'transcript_id',
                        'developmental_stage',
                        'raw_value',
                        'normalized_value'
                    ));
                    echo "\n";
                    // write the rows
                    foreach ($results as $result) {
                        echo implode("\t", array(
                            $result['gene'],
                            $result['transcript'],
                            $result['stage'],
                            round($result['value_raw'], 2),
                            round($result['value_normalized'], 2)
                        ));
                        echo "\n";
                    }
                } else {
                    echo '';
                }
                die();
            } // id $format == ...
        } // if $tissue !== ''
    } // if $query !== ''

    // if above conditions not satisfied
    header('Content-Type: application/json');
    echo json_encode(array('error' => 'Missing query or tissue parameter!'));
    die();

?>
