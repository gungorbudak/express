<?php

    /*
    Express API
    */

    /*
    MySQL table create queries

    CREATE TABLE gene (
        gene_alias CHAR(25) NOT NULL,
        gene_name CHAR(25) NOT NULL,
        gene_id CHAR(25) NOT NULL,
        mgi_gene_id CHAR(25),
        chr_name CHAR(5) NOT NULL,
        start INT(11) NOT NULL,
        end INT(11) NOT NULL,
        strand CHAR(1) NOT NULL,
        PRIMARY KEY (gene_alias, gene_id),
        INDEX name (gene_alias, gene_name, gene_id, mgi_gene_id)
    );

    CREATE TABLE transcript (
        transcript_id CHAR(25) NOT NULL,
        gene_id CHAR(25) NOT NULL,
        PRIMARY KEY (transcript_id, gene_id)
    );

    CREATE TABLE expression (
        transcript_id CHAR(25) NOT NULL,
        sample_id CHAR(25) NOT NULL,
        dev_stage CHAR(5) NOT NULL,
        tissue_type CHAR(25) NOT NULL,
        chr_name CHAR(5) NOT NULL,
        start INT(11) NOT NULL,
        end INT(11) NOT NULL,
        strand CHAR(1) NOT NULL,
        tpm DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (transcript_id, sample_id, dev_stage, tissue_type),
        INDEX name (transcript_id, sample_id, dev_stage, tissue_type, chr_name, start, end)
    );

    */

    require_once 'config.php';
    // this PHP file has an array like following
    // kept separate for security reasons
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
            $type = 'gene_id';
        } elseif (starts_with($query, 'MGI:')) {
            $type = 'mgi_gene_id';
        } elseif (starts_with($query, 'ENSMUST')) {
            $type = 'transcript_id';
        } else {
            $type = 'gene_alias';
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

    function get_expression($parsed, $tissue_type, $db) {
        $results = array();
        if ($parsed['is_location'] === true) {
            // if a location is given
            $stmt = $db->prepare("SELECT
                transcript_id AS transcript,
                dev_stage AS stage,
                AVG(tpm) AS value,
                CONCAT(chr_name, ':', start, '-', end) AS location
                FROM expression
                WHERE tissue_type = :tissue_type
                AND chr_name = :chr_name
                AND start < :end
                AND end > :start
                GROUP BY dev_stage, transcript_id");
            $stmt->execute(array(
                ':tissue_type' => $tissue_type,
                ':chr_name' => $parsed['query']['chr_name'],
                ':start' => $parsed['query']['start'],
                ':end' => $parsed['query']['end'],
            ));
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            // if any of the following is given
            // transcript ID
            // gene ID
            // MGI ID
            // gene alias (same as gene name)
            if ($parsed['type'] == 'gene_id') {
                $stmt = $db->prepare("SELECT
                    transcript.transcript_id
                    FROM gene, transcript
                    WHERE gene.gene_id = transcript.gene_id
                    AND gene.gene_id = :query
                    GROUP BY transcript.transcript_id");
            } elseif ($parsed['type'] == 'mgi_gene_id') {
                $stmt = $db->prepare("SELECT
                    transcript.transcript_id
                    FROM gene, transcript
                    WHERE gene.gene_id = transcript.gene_id
                    AND gene.mgi_gene_id = :query
                    GROUP BY transcript.transcript_id");
            } elseif ($parsed['type'] == 'transcript_id') {
                $stmt = $db->prepare("SELECT
                    transcript.transcript_id
                    FROM gene, transcript
                    WHERE gene.gene_id = transcript.gene_id
                    AND transcript.transcript_id = :query
                    GROUP BY transcript.transcript_id");
            } else {
                $stmt = $db->prepare("SELECT
                    transcript.transcript_id
                    FROM gene, transcript
                    WHERE gene.gene_id = transcript.gene_id
                    AND gene.gene_alias = :query
                    GROUP BY transcript.transcript_id");
            }
            $stmt->execute(array(
                ':query' => $parsed['query']
            ));
            // fetch all distinct transcript IDs as single dimensional array
            $transcript_ids = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
            $count = count($transcript_ids);
            if ($count > 0) {
                $in = join(',', array_pad(array(), $count, '?'));
                $params = $transcript_ids;
                array_unshift($params, $tissue_type);
                // fetch for those transcript IDs TPMs
                $stmt = $db->prepare("SELECT
                    transcript_id AS transcript,
                    dev_stage AS stage,
                    AVG(tpm) AS value,
                    CONCAT(chr_name, ':', start, '-', end) AS location
                    FROM expression
                    WHERE tissue_type = ?
                    AND transcript_id IN ($in)
                    GROUP BY dev_stage, transcript_id");
                $stmt->execute($params);
                // fetch expression values
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }
        // sort the results by developmental stage
        usort($results, function($a, $b) {
            return strnatcmp($a['stage'], $b['stage']);
        });
        return $results;
    }

    function normalize_row($results) {
        // find the maximum values for each transcript or row
        $max_vals = array();
        foreach ($results as $result) {
            if (array_key_exists($result['transcript'], $max_vals)) {
                if ($max_vals[$result['transcript']] < floatval($result['value'])) {
                    $max_vals[$result['transcript']] = floatval($result['value']);
                }
            } else {
                $max_vals[$result['transcript']] = floatval($result['value']);
            }
        }
        $normalized = array();
        foreach ($results as $result) {
            // keep raw value in valueRaw key
            $result['valueRaw'] = floatval($result['value']);
            // normalize the value in value key
            if ($max_vals[$result['transcript']] > 0) {
                $result['value'] = floatval($result['value']) / $max_vals[$result['transcript']];
            } else {
                $result['value'] = floatval($result['value']);
            }
            $normalized[] = $result;
        }
        return $normalized;
    }

    function get_location($parsed, $db) {
        // if any of the following is given
        // transcript ID
        // gene ID
        // MGI ID
        // gene name
        // gene alias
        if ($parsed['type'] == 'gene_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene
                WHERE gene.gene_id = :query");
        } elseif ($parsed['type'] == 'mgi_gene_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene
                WHERE gene.mgi_gene_id = :query");
        } elseif ($parsed['type'] == 'transcript_id') {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene, transcript
                WHERE gene.gene_id = transcript.gene_id
                AND transcript.transcript_id = :query
                GROUP BY transcript.transcript_id");
        } else {
            $stmt = $db->prepare("SELECT
                gene.chr_name,
                gene.start,
                gene.end
                FROM gene
                WHERE gene.gene_alias = :query");
        }
        $stmt->execute(array(
            ':query' => strtoupper($parsed['query'])
        ));
        $location = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return $location[0];
    }

    $query = (isset($_GET['query']) === true && empty($_GET['query']) === false) ? sanitize($_GET['query']) :'';
    $tissue = (isset($_GET['tissue']) === true && empty($_GET['tissue']) === false) ? sanitize($_GET['tissue']) :'';
    $format = (isset($_GET['format']) === true && empty($_GET['format']) === false) ? sanitize($_GET['format']) :'json';

    if ($query !== '') {

        // try connecting to the database
        try {
            // $db = new PDO('sqlite:test.sqlite');
            $db = new PDO(
                'mysql:host='. $config['host']
                .';port='. $config['port']
                .';dbname='. $config['dbname'], $config['user'], $config['pass']);
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
            $results = get_expression($parsed, $tissue, $db);
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
                        'transcript_id',
                        'developmental_stage',
                        'raw_value',
                        'normalized_value'
                    ));
                    echo "\n";
                    // write the rows
                    foreach ($results as $result) {
                        echo implode("\t", array(
                            $result['transcript'],
                            $result['stage'],
                            $result['valueRaw'],
                            $result['value']
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
