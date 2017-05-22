<?php

    /*

    Express API
    Author: Gungor Budak, gngrbdk@gmail.com

    MySQL queries

    DROP DATABASE express;
    CREATE DATABASE express;
    USE express;

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
        FOREIGN KEY fk_gene (ensembl_gene_id) REFERENCES gene (ensembl_gene_id)
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
        novelty INT(1) NOT NULL,
        tpm_raw DOUBLE PRECISION NOT NULL,
        tpm_normalized DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (transcript_id, sample_id),
        FOREIGN KEY fk_sample (sample_id) REFERENCES sample (sample_id),
        INDEX name (transcript_id, sample_id, chr_name, start, end)
    );

    CREATE TABLE transcript (
        ensembl_transcript_id CHAR(25) NOT NULL,
        ensembl_gene_id CHAR(25) NOT NULL,
        FOREIGN KEY fk_transcript (ensembl_transcript_id) REFERENCES expression (transcript_id),
        FOREIGN KEY fk_gene (ensembl_gene_id) REFERENCES gene (ensembl_gene_id)
    );

    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express express-tables/gene.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express express-tables/synonym.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express express-tables/transcript.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express express-tables/sample.tsv
    mysqlimport --ignore-lines=1 --fields-terminated-by='\t' --lines-terminated-by='\n' --local -v -u root -p express express-tables/expression.tsv

    mysqldump -u root -p express | gzip > express.sql.gz
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

    function get_expression($parsed, $tissue_type, $cutoff, $db) {
        $transcript_ids = array();
        $data = array();
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
            // fetch expression data for those transcript IDs TPMs
            $stmt = $db->prepare("SELECT
                expression.transcript_id AS transcript,
                sample.dev_stage AS stage,
                sample.bioproject_id AS bioproject_id,
                sample.pubmed_id AS pubmed_id,
                sample.reference AS reference,
                expression.novelty AS novelty,
                AVG(expression.tpm_raw) AS value_raw,
                AVG(expression.tpm_normalized) AS value_normalized,
                CONCAT(expression.chr_name, ':', expression.start, '-', expression.end) AS location
                FROM sample, expression
                WHERE expression.sample_id = sample.sample_id
                AND sample.tissue_type = ?
                AND expression.transcript_id IN ($in)
                AND expression.tpm_normalized >= ?
                GROUP BY sample.dev_stage, expression.transcript_id");
            $stmt->execute($params);
            // fetch expression values
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // get the resulting Ensembl transcript IDs for obtaining gene names
            $transcript_ids = array_map(function ($arr) {
                return $arr['transcript'];
            }, $data);

            $count = count($transcript_ids);
            // do we have any expression data for given transcripts?
            if ($count > 0) {
                $in = join(',', array_pad(array(), $count, '?'));
                // prepare an SQL for getting gene names
                $stmt = $db->prepare("SELECT
                    transcript.ensembl_transcript_id AS transcript,
                    synonym.gene_name AS gene
                    FROM transcript, gene, synonym
                    WHERE gene.ensembl_gene_id = synonym.ensembl_gene_id
                    AND transcript.ensembl_gene_id = gene.ensembl_gene_id
                    AND transcript.ensembl_transcript_id IN ($in)
                    GROUP BY transcript.ensembl_transcript_id");
                $stmt->execute($transcript_ids);
                // fetch gene names
                $gene_names = $stmt->fetchAll(PDO::FETCH_COLUMN|PDO::FETCH_GROUP);

                // add gene names to data
                foreach ($data as $d) {
                    if (!starts_with($d['transcript'], 'MSTRG')) {
                        $d['gene'] = $gene_names[$d['transcript']][0];
                    } else {
                        $d['gene'] = '';
                    }
                    $results[] = $d;
                }

                // sort the results by developmental stage
                usort($results, function($a, $b) {
                    return strnatcmp($a['stage'], $b['stage']);
                });
            }
        }
        return $results;
    }

    function normalize_row($results, $value) {
        $normalize_by = 'value_' . $value;
        // collect values per row (transcript)
        $row_vals = array();
        foreach ($results as $result) {
            if (!array_key_exists($result['transcript'], $row_vals)) {
                $row_vals[$result['transcript']] = array();
            }
            array_push($row_vals[$result['transcript']], floatval($result[$normalize_by]));
        }
        // row-normalize and calculate average per row
        $data = array();
        foreach ($results as $result) {
            $vals = $row_vals[$result['transcript']];
            // get the max value
            $max_val = max($vals);
            // normalize the value in value_normalized key
            if ($max_val > 0) {
                $result['value'] = floatval($result[$normalize_by]) / $max_val;
            } else {
                $result['value'] = floatval($result[$normalize_by]);
            }
            // set the average
            $result['value_averaged'] = array_sum($vals) / count($vals);
            $data[] = $result;
        }
        return $data;
    }

    $query = (isset($_GET['query']) === true) ? sanitize($_GET['query']) : '';
    $tissue = (isset($_GET['tissue']) === true) ? sanitize($_GET['tissue']) : '';
    $cutoff = (isset($_GET['cutoff']) === true) ? floatval(sanitize($_GET['cutoff'])) : 5;
    $value = (isset($_GET['value']) === true) ? sanitize($_GET['value']) : 'raw';
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
            $results = normalize_row($results, $value);
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
                        'bioproject_id',
                        'pubmed_id',
                        'reference',
                        'novelty',
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
                            $result['bioproject_id'],
                            $result['pubmed_id'],
                            $result['reference'],
                            $result['novelty'],
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
