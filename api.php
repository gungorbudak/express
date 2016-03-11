<?php

    /*
    Express API
    */

    /*
    Sanitizing user input
    */
    function sanitize($query) {
        return trim(htmlspecialchars(strip_tags($query)));
    }

    /*
    Parsing query and identfying if the search is using location
    or any other identifier like gene name, transcript ID
    */
    function parse_query($query) {
        $parsed = array(
            'is_location' => false,
            'query' => strtoupper($query)
        );
        if (preg_match('/^(.*):(.*)-(.*)$/', $query, $match)) {
            $parsed['is_location'] = true;
            $parsed['query'] = array(
                'chr_name' => $match[1],
                'start' => intval($match[2]),
                'end' => intval($match[3])
            );
        }
        return $parsed;
    }

    function query_database($parsed, $tissue_type, $db) {
        $results = array();
        if ($parsed['is_location'] === true) {
            // if a location is given
            $stmt = $db->prepare('SELECT
                transcript_id AS transcript,
                dev_stage AS stage,
                AVG(tpm) AS value
                FROM expression
                WHERE tissue_type = :tissue_type
                AND chr_name = :chr_name
                AND start < :end
                AND end > :start
                GROUP BY dev_stage, transcript_id');
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
            // gene name
            // gene alias
            $stmt = $db->prepare('SELECT
                transcript.transcript_id
                FROM gene
                INNER JOIN transcript
                ON gene.gene_id = transcript.gene_id
                WHERE transcript.transcript_id = :query
                OR gene.gene_id = :query
                OR gene.gene_name = :query
                OR gene.gene_alias = :query
                OR gene.mgi_gene_id = :query
                GROUP BY transcript.transcript_id');
            $stmt->execute(array(
                ':query' => $parsed['query']
            ));
            // fetch all distinct transcript IDs as single dimensional array
            $transcript_ids = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
            $in = join(',', array_pad(array(), count($transcript_ids), '?'));
            $params = $transcript_ids;
            array_unshift($params, $tissue_type);
            // fetch for those transcript IDs TPMs
            $stmt = $db->prepare("SELECT
                transcript_id AS transcript,
                dev_stage AS stage,
                AVG(tpm) AS value
                FROM expression
                WHERE tissue_type = ?
                AND transcript_id IN ($in)
                GROUP BY dev_stage, transcript_id");
            $stmt->execute($params);
            // fetch expression values
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        // sort the results by developmental stage
        usort($results, function($a, $b) {
            return strnatcmp($a['stage'], $b['stage']);
        });
        return $results;
    }

    function normalize_row($results) {
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
            if ($max_vals[$result['transcript']] > 0) {
                $result['value'] = floatval($result['value']) / $max_vals[$result['transcript']];
            } else {
                $result['value'] = floatval($result['value']);
            }
            $normalized[] = $result;
        }
        return $normalized;
    }

    $query = (isset($_GET['query']) === true && empty($_GET['query']) === false) ? sanitize($_GET['query']) :'';
    $tissue = (isset($_GET['tissue']) === true && empty($_GET['tissue']) === false) ? sanitize($_GET['tissue']) :'';

    if ($query !== '' && $tissue !== '') {
        // try connecting to the database
        try {
            $db = new PDO('sqlite:test.sqlite');
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $e) {
            header('Content-Type: application/json');
            echo json_encode(array('error' => 'DB operation failed with the following error: ' . $e->getMessage()));
            die();
        }
        // parsing query for identifying location search
        $parsed = parse_query($query);
        // query the database and obtain required fields
        $results = query_database($parsed, $tissue, $db);
        // normalize results
        $results = normalize_row($results);
        // return the JSON format of the data
        header('Content-Type: application/json');
        echo json_encode($results);
        die();
    } else {
        header('Content-Type: application/json');
        echo json_encode(array('error' => 'Missing query and/or tissue parameter!'));
        die();
    }

?>
