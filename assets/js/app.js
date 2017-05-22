'use strict';

// base URL to the root with trailing slash
var baseUrl = 'http://www.iupui.edu/~sysbio/express/';
// a global variable for the browser since
// it will be generated only once
var browser = null;
// global spinner and target, actually body element
var target = document.body;
var spinner = new Spinner({
    lines: 15,
    length: 0,
    width: 12,
    radius: 32
});

function getHashValue(key) {
    var matches = window.location.hash.match(new RegExp(key + '=([^&]*)'));
    return matches ? matches[1]: null;
}

/*
Gets location from query via a callback function
*/
function getLocation(query, callback) {
    var parsed = query.trim().match(/^(.*):(.*)-(.*)$/i);
    var location = null;

    if (parsed !== null) {
        // directly return parsed location
        location = {
            chr_name: parsed[1].trim(),
            start: parseInt(parsed[2]),
            end: parseInt(parsed[3])
        };
        callback(location);
    } else {
        // make a request to get location using identifier
        var request = [
            baseUrl, 'app/api.php',
            '?query=', query, '&format=location'
        ].join('');

        console.log(request);

        $.get(request, function(data) {
            if (data !== null) {
                location = {
                    chr_name: data['chr_name'].trim(),
                    start: parseInt(data['start']),
                    end: parseInt(data['end'])
                };
            }
            callback(location);
        });
    }
}

function drawBrowser(query) {

    var sources = [{
        name: 'Genome',
        twoBitURI: baseUrl + 'resources/mm10.2bit',
        desc: 'Mouse reference genome build GRCm38',
        tier_type: 'sequence',
        provides_entrypoints: true,
        pinned: true,
    }, {
        name: 'Transcripts',
        desc: 'Mouse transcript structures modified GENCODE version M7 (GRCm38.p4) with additional novel transcripts',
        bwgURI: baseUrl + 'resources/gencode.vM7.annotation.custom.bb',
        stylesheet_uri: baseUrl + 'resources/gencode.xml',
        collapseSuperGroups: false,
        trixURI: baseUrl + 'resources/gencode.vM7.annotation.ix',
        noSourceFeatureInfo: true,
        provides_search: true
    }];

    // returns the location as a callback
    getLocation(query, function(location) {
        // location might be null due to no results coming from DB
        if (location !== null) {
            // instantiate the browser once
            browser = new Browser({
                // default view at the beginning
                chr: location['chr_name'],
                viewStart: location['start'],
                viewEnd: location['end'],
                cookieKey: 'mouse',
                // define mouse coordinate system
                coordSystem: {
                    speciesName: 'Mouse',
                    taxon: 10090,
                    auth: 'GRCm',
                    version: 38,
                    ucscName: 'mm10'
                },
                // reference genome and reference transcripts (exons/introns)
                sources: sources,
                // additional options for customizing the browser
                pageName: 'div-browser',
                uiPrefix: '//www.biodalliance.org/release-0.13/',
                maxHeight: 300,
                fullScreen: false,
                setDocumentTitle: false,
                disablePoweredBy: true,
                noLeapButtons: true,
                noLocationField: false,
                // noZoomSlider: true,
                noTitle: true,
                noTrackAdder: true,
                noTrackEditor: true,
                noExport: true,
                noOptions: true,
                noHelp: true,
                noClearHighlightsButton: true,
                noPersist: true,
                noPersistView: true,
                noDefaultLabels: false,
                disableDefaultFeaturePopup: true,
                reverseScrolling: true,
            });
        }
    });
}

function drawTable(data) {
    var $container = $("#div-table");
    $container.empty();

    if (data !== null && data.length > 0) {

        // TODO: make this unique for stage and bioproject_id
        var unique_data = data.sort(function(a, b) {
          return a.stage.localeCompare(b.stage);
        }).filter(function(item, pos, array) {
            return array.map(function(mapItem) {
                return mapItem['stage'];
            }).indexOf(item['stage']) === pos;
        })

        // set up the table and the header
        var $div = $("<div>", {class: "table-responsive"}).appendTo($container);
        var $table = $("<table>", {class: "table table-striped"}).appendTo($div);
        var $thead = $("<thead>").appendTo($table);
        var $tr = $("<tr>").appendTo($thead);
        $tr.append($("<th>", {text: "Developmental stage"}));
        $tr.append($("<th>", {text: "NCBI BioProject ID"}));
        $tr.append($("<th>", {text: "PubMed reference"}));

        // set up the table body with the data
        var $tbody = $("<tbody>").appendTo($table);

        unique_data.forEach(function(d) {
            var $tr = $("<tr>").appendTo($tbody);
            $tr.append($("<td>", {text: d.stage}));
            var $td = $("<td>").appendTo($tr);
            $td.append($("<a>", {
                href: "https://www.ncbi.nlm.nih.gov/bioproject/" + d.bioproject_id,
                text: d.bioproject_id,
                target: "_blank"
            }));
            var $td = $("<td>").appendTo($tr);
            $td.append($("<a>", {
                href: "https://www.ncbi.nlm.nih.gov/pubmed/" + d.pubmed_id,
                text: d.reference,
                target: "_blank"
            }));
        });
    } else {
        // clear the table container
        $container.empty();
    }
}

function drawHeatmap(query, tissue, cutoff, value) {
    spinner.spin(target);

    var request = [
        baseUrl, 'app/api.php',
        '?query=', query,
        '&tissue=', tissue,
        '&cutoff=', cutoff,
        '&value=', value
    ].join('');

    console.log(request);

    d3.json(request, function(data) {

        var container = d3.select("#div-heatmap");

        // data available?
        if (data !== null && data.length > 0) {
            var stageNum = {};
            var stageCounter = 0;
            var transcriptNum = {};
            var transcriptCounter = 0;

            data.forEach(function(d) {
                if (!stageNum.hasOwnProperty(d.stage)) {
                    stageCounter++;
                    stageNum[d.stage] = stageCounter;
                }
                if (!transcriptNum.hasOwnProperty(d.transcript)) {
                    transcriptCounter++;
                    transcriptNum[d.transcript] = transcriptCounter;
                }
            });

            var stages = data.reduce(function(sofar, cur) {
                return sofar.indexOf(cur.stage) < 0 ? sofar.concat([cur.stage]) : sofar;
            }, []);

            var transcripts = data.sort(function (a, b) {
                // sort by novelty & averaged value
                // greater than cases
                if ( (b.novelty === '0' && a.novelty === '1') ||
                     (b.novelty === '0' && a.novelty === '2') ||
                     (b.novelty === '2' && a.novelty === '1')
                   )
                  return 1;
                // less than cases
                if ( (b.novelty === '1' && a.novelty === '0') ||
                     (b.novelty === '2' && a.novelty === '0') ||
                     (b.novelty === '1' && a.novelty === '2')
                   )
                  return -1;
                // equal case
                if (b.novelty === a.novelty)
                  return b.value_averaged - a.value_averaged;
                // rest
                return 0;
              }).reduce(function(sofar, cur) {
              // serialize gene name, transcript ID, location and novelty
              cur = [cur.gene, cur.transcript, cur.location, cur.novelty].join('__');
              return sofar.indexOf(cur) < 0 ? sofar.concat([cur]) : sofar;
            }, []);

            var margin = { top: 100, right: 0, bottom: 0, left: 200 };
            var width = 1200 - margin.left - margin.right;
            var height = (60 * (transcripts.length + 1)) - margin.top - margin.bottom;
            var colors = ["#f7fbff","#deebf7","#c6dbef","#9ecae1",
              "#6baed6","#4292c6","#2171b5","#08519c","#08306b"];

            // fix the shortest height 60
            height = Math.max(height, 60);

            var innerWidth = width + margin.left + margin.right;
            var innerHeight = height + margin.top + margin.bottom;

            var cardSize = {
                width: Math.floor(width / stages.length),
                height: Math.floor(height / transcripts.length)
            };

            container.selectAll("*").remove();

            var svg = container.append("svg")
                .attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", "0 0 " + innerWidth + " " + innerHeight)
                .attr("preserveAspectRatio", "xMinYMid meet");

            svg.append("rect")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("fill", "#FFFFFF");

            var heatmap = svg.append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            var stageLabels = heatmap.selectAll(".label-stage")
                .data(stages)
                .enter().append("text")
                  .text(function(d) { return d; })
                  .attr("x", function(d, i) { return i * cardSize.width; })
                  .attr("y", 0)
                  .attr("transform", "translate(" + cardSize.width / 2 + ", -16)")
                  .style("font-family", "sans-serif")
                  .style("font-size", "22px")
                  .style("text-anchor", "middle")
                  .style("fill", "#101010");

            var transcriptLabels = heatmap.selectAll("g.group-transcript")
              .data(transcripts);

            var transcriptLabelsEnter = transcriptLabels.enter()
              .append("g")
              .attr("class", "group-transcript");
            transcriptLabelsEnter.append("text")
              .attr("class", "label-gene-symbol");
            transcriptLabelsEnter.append("text")
              .attr("class", "label-transcript-id");
            transcriptLabelsEnter.append("text")
              .attr("class", "label-transcript-location");

            transcriptLabels.select("text.label-gene-symbol")
              .text(function (d) {
                return (d.split('__')[1].startsWith('ENS')) ? d.split('__')[0]: "";
              })
              .attr("x", 0)
              .attr("y", function (d, i) { return i * cardSize.height; })
              .attr("transform", "translate(-24," + cardSize.height / 2.85 + ")")
              .style("font-family", "sans-serif")
              .style("text-anchor", "end")
              .style("fill", "#101010");

            transcriptLabels.select("text.label-transcript-id")
              .text(function (d) { return d.split('__')[1]; })
              .attr("x", 0)
              .attr("y", function (d, i) { return i * cardSize.height; })
              .attr("transform", "translate(-24," + cardSize.height / 1.70 + ")")
              .style("font-family", "sans-serif")
              .style("text-anchor", "end")
              .style("fill", function(d) {
                var color = '#101010';
                if (d.split('__')[1].startsWith('ENS'))
                  color = '#337ab7';
                if (d.split('__')[3] == '2')
                  color = '#5cb85c';
                return color;
              })
              .style("text-decoration", function(d) {
                return (d.split('__')[1].startsWith('ENS')) ? "underline": "none";
              })
              .style("cursor", function(d) {
                return (d.split('__')[1].startsWith('ENS')) ? "pointer": "auto";
              })
              .on("click", function(d) {
                var id = d.split('__')[1];
                if (id.startsWith('ENS')) {
                  return window.open("http://www.ensembl.org/id/" + id);
                } else {
                  return false;
                }
              });

            transcriptLabels.select("text.label-transcript-location")
              .text(function (d) { return d.split('__')[2]; })
              .attr("x", 0)
              .attr("y", function (d, i) { return i * cardSize.height; })
              .attr("transform", "translate(-24," + cardSize.height / 1.15 + ")")
              .style("font-family", "sans-serif")
              .style("text-anchor", "end")
              .style("fill", "#101010");

            var colorScale = d3.scale.quantile()
              .domain([0, d3.max(data, function (d) { return d.value; })])
              .range(colors);

            var xScale = function(stage) {
              return (stageNum[stage] - 1) * cardSize.width;
            };

            var yScale = function(transcript) {
              return (transcriptNum[transcript] - 1) * cardSize.height;
            };

            var cards = heatmap.selectAll(".card")
              .data(data, function(d) {
                return transcriptNum[d.transcript] + ':' + stageNum[d.stage];
              });

            cards.enter().append("g")
              .attr("class", "card");

            cards.append("rect")
              .attr("x", function(d) { return xScale(d.stage); })
              .attr("y", function(d) { return yScale(d.transcript); })
              .attr("rx", 4)
              .attr("ry", 4)
              .attr("width", cardSize.width)
              .attr("height", cardSize.height)
              .style("stroke", "#E6E6E6")
              .style("stroke-width", "1px")
              .style("fill", function(d) { return colorScale(d.value); });

            cards.append("text")
              .text(function(d) { return d.value.toFixed(4); })
              .attr("x", function(d) { return xScale(d.stage) + (cardSize.width / 2) - 20; })
              .attr("y", function(d) { return yScale(d.transcript) + (cardSize.height / 2) + 5; })
              .style("font-family", "sans-serif")
              .style("fill", function(d) { return (d.value >= 0.44) ? "#FFFFFF": "#000000"; });

            cards.exit().remove();

            var quantiles = [0].concat(colorScale.quantiles());
            var legendSize = {
              width: Math.floor(width / quantiles.length),
              height: 20
            };
            var legend = heatmap.selectAll(".legend")
              .data(quantiles, function(d) { return d; });

            legend.enter().append("g")
              .attr("class", "legend");

            legend.append("rect")
              .attr("x", function(d, i) { return legendSize.width * i; })
              .attr("y", -80)
              .attr("rx", 4)
              .attr("ry", 4)
              .attr("width", legendSize.width)
              .attr("height", legendSize.height)
              .style("stroke", "#E6E6E6")
              .style("stroke-width", "1px")
              .style("fill", function(d, i) { return colors[i]; });

            legend.append("text")
              .text(function(d) { return "≥ " + d.toFixed(2); })
              .attr("x", function(d, i) { return ( (legendSize.width / 2) - 18) + (legendSize.width * i); })
              .attr("y", -65)
              .style("font-family", "sans-serif")
              .style("fill", function(d, i) { return (i > 3) ? "#FFFFFF": "#000000"; });

            legend.exit().remove();

        } else {
            // tell user there is no data
            alertUser('There is no expression profiles for your search.');
            // clear the heatmap container
            container.selectAll("*").remove();
            // hide the heatmap separator
            $('#hr-separator-heatmap').addClass('hidden');
        }

        // draw the table from obtained data
        drawTable(data);

        spinner.stop();
    });
}

/*
Checks if the heatmap button in the menu is active
*/
function isHeatmap() {
    return $('.btn-heatmap').data('state');
}

/*
Checks if the browser button in the menu is active
*/
function isBrowser() {
    return $('.btn-browser').data('state');
}

/*
Gets the recently entered query from the form
*/
function getQuery() {
    var query = $('input[name="query"]').val();
    return query;
}

function setQuery(query) {
    $('input[name="query"]').val(query);
}

/*
Gets the recently selected tissue from the form
*/
function getTissue() {
    var tissue = $('select[name="tissue"]').val();
    return tissue;
}

function setTissue(tissue) {
    $('select[name="tissue"]').val(tissue);
}

/*
Gets the recently selected TPM cutoff from the form
*/
function getCutoff() {
    var cutoff = $('select[name="cutoff"]').val();
    return cutoff;
}

function setCutoff(cutoff) {
    $('select[name="cutoff"]').val(cutoff);
}

/*
Gets the recently selected value type from the form
*/
function getValue() {
    var value = $('select[name="value"]').val();
    return value;
}

function setValue(value) {
    $('select[name="value"]').val(value);
}

/*
Given any message, alerts the user by adding
an alert box to warnings div in index.html
*/
function alertUser(message) {
    var $closeBtn = $('<button>')
        .attr('type', 'button')
        .attr('data-dismiss', 'alert')
        .addClass('close')
        .append($('<span>').append('&times;'));
    var $message = $('<div>')
        .html(message)
        .addClass('alert alert-warning alert-dismissible')
        .attr('role', 'alert')
        .append($closeBtn);
    $('#div-warnings').append($message);
}

/*
Modifies the generated SVG
by Biodalliance for cleaner output
*/
function modifySvg(svg) {
    // remove dalliance link
    svg = svg.replace(/<a.*<\/a>/gi, '');
    // parse SVG string to XML DOM element
    var $xml = $($.parseXML(svg));
    // find all group elements to shift
    var groups = $xml.find('g[clip-path="url(#featureClip)"] g');
    [].forEach.call(groups, function(g) {
        var $g = $(g);
        var texts = $g.find('text');
        // var attr = $g.attr('transform');
        // // shift the groups to 50px right
        // if (attr !== undefined && attr !== false) {
        //     $g.attr('transform', attr.replace('200', '250'));
        // }
        // set missing text x to -50px
        [].forEach.call(texts, function(t) {
          var $t = $(t);
          if ($t.text().startsWith('>ENS')
              || $t.text().startsWith('>MSTRG')) {
            if ($t.attr('x') < 0) {
              $t.attr('x', '0');
            }
          }
        });
    });
    return new XMLSerializer().serializeToString($xml.get(0));
}

function searchOnBrowser(query) {
    // returns location as a callback function
    getLocation(query, function(location) {
        // location available?
        if (location !== null) {
            var q = [
                location['chr_name'], ':',
                location['start'], '..',
                location['end']
            ].join('');

            if (browser !== undefined) {
                browser.search(q, function(err) {
                    if (err === undefined) {
                        browser.clearHighlights();
                    } else {
                        console.log(err);
                    }
                });
            }
        }
    });
}

function toggleSearch(toggle) {
    $('input[name="query"]').attr('disabled', toggle);
    $('select[name="tissue"]').attr('disabled', toggle);
    $('select[name="cutoff"]').attr('disabled', toggle);
    $('select[name="value"]').attr('disabled', toggle);
    $('button[name="search"]').attr('disabled', toggle);
}

function search(query, tissue, cutoff, value) {
    // check if all search parameters are given
    if (query != '' && tissue != '' && cutoff != '' && value != '') {

        // disable form elements
        toggleSearch(true);

        var parameters = [
          '#query=', query,
          '&tissue=', tissue,
          '&cutoff=', cutoff,
          '&value=', value
        ].join('');
        window.location.hash = parameters;

        if (browser === null) {
            // draw the browser from scratch
            drawBrowser(query);
        } else {
            // browser has been initiated, just search
            searchOnBrowser(query);
        }
        if (isHeatmap()) {
            // draw/update the heatmap
            drawHeatmap(query, tissue, cutoff, value);
        }

        // enable back form elements
        toggleSearch(false);
    } else {
      alertUser('Missing search parameters.')
    }
    toggleSeparator();
}

function saveData(data, type, name) {
    if (data.length > 0) {
        var blob = new Blob([data], {type: type});
        // using FileSaver.js
        saveAs(blob, name);
    } else {
        // alert user
        alertUser('There is no data to export.');
    }
    return;
}

function exportView(view, format) {
  var query = getQuery();
  var tissue = getTissue();
  var cutoff = getCutoff();
  var value = getValue();

  if (query.length > 0 && tissue.length > 0 && cutoff.length > 0 && value.length > 0) {
    var namePrefix = [
      query.replace(':', '-'),
      tissue,
      cutoff,
      value
    ].join('_');

    if (view == 'heatmap') {
      if (isHeatmap()) {

        spinner.spin(target);
        var data = '';

        if (format == 'svg') {

          var name = namePrefix + '_heatmap_view.svg';
          data = $('#div-heatmap').html().trim();
          saveData(data, 'image/svg+xml', name);
          spinner.stop();

        } else if (format == 'tsv') {

          var request = [
            baseUrl, 'app/api.php',
            '?query=', query,
            '&cutoff=', cutoff,
            '&tissue=', tissue,
            '&value=', value,
            '&format=', format
            ].join('');

            $.get(request, function(tsv) {

              var name = namePrefix + '_heatmap_data.tsv';
              saveData(tsv, 'text/tsv', name);
              spinner.stop();

              });
        }
      } else { // if isHeatmap()
        alertUser('Heatmap view is not available.');
      }
    }

    if (view == 'browser') {
      if (isBrowser() && browser !== null) {

        spinner.spin(target);
        var svg = browser.makeSVG({
          highlights: true,
          ruler: true
        });

        var reader = new FileReader();
        reader.addEventListener("loadend", function() {
          var name = namePrefix + '_browser_view.svg';
          var data = modifySvg(reader.result);
          saveData(data, 'image/svg+xml', name);
          spinner.stop();

        });
        reader.readAsText(svg);

      } else { // if isBrowser()
        alertUser('Browser view is not available.');
      }
    }

  } else { // if tissue and query
    // alert user
    alertUser('There is no data to export.');
  }
}

function toggleSeparator() {
    var query = getQuery();
    var tissue = getTissue();
    var cutoff = getCutoff();
    var $hrSeparatorBrowser = $('#hr-separator-browser');
    var $hrSeparatorHeatmap = $('#hr-separator-heatmap');
    var btnBrowserState = $('.btn-browser').data('state');
    var btnHeatmapState = $('.btn-heatmap').data('state');

    // control visibility of browser separator
    if (browser !== null &&
        btnBrowserState && btnHeatmapState &&
        tissue.length > 0 && cutoff.length > 0 && query.length > 0) {
        $hrSeparatorBrowser.removeClass('hidden');
    } else {
        $hrSeparatorBrowser.addClass('hidden');
    }

    // control visibility of heatmap separator
    if ((btnBrowserState || btnHeatmapState) &&
        tissue.length > 0 && cutoff.length > 0 && query.length > 0) {
        $hrSeparatorHeatmap.removeClass('hidden');
    } else {
        $hrSeparatorHeatmap.addClass('hidden');
    }

    return;
};

function toggleView($btn) {
    var $div = $('#div-' + $btn.get(0).className.split('-')[1]);

    $btn.data('state', !$btn.data('state'));
    $btn.parent().toggleClass('active');
    if ($btn.data('state')) {
        $div.removeClass('hidden');
    } else {
        $div.addClass('hidden');
    }

    toggleSeparator();

    return;
}

// event handlers
$(document).ready(function() {
    var query = getHashValue('query');
    var tissue = getHashValue('tissue');
    var cutoff = getHashValue('cutoff');
    var value = getHashValue('value');

    if (query !== null && tissue !== null && cutoff !== null && value !== null) {
        setTissue(tissue);
        setCutoff(cutoff);
        setQuery(query);
        setValue(value);
        search(query, tissue, cutoff, value);
    }

    $('select[name="tissue"]').on('change', function(e) {
      var query = getQuery();
      var tissue = getTissue();
      var cutoff = getCutoff();
      var value = getValue();
      if (query.length > 0) {
        search(query, tissue, cutoff, value);
      }
    });

    $('select[name="cutoff"]').on('change', function(e) {
      var query = getQuery();
      var tissue = getTissue();
      var cutoff = getCutoff();
      var value = getValue();
      if (query.length > 0) {
        search(query, tissue, cutoff, value);
      }
    });

    $('select[name="value"]').on('change', function(e) {
      var query = getQuery();
      var tissue = getTissue();
      var cutoff = getCutoff();
      var value = getValue();
      if (query.length > 0) {
        search(query, tissue, cutoff, value);
      }
    });

    $('button[name="search"]').on('click', function(e) {
      e.preventDefault();
      var tissue = getTissue();
      var cutoff = getCutoff();
      var query = getQuery();
      var value = getValue();
      if (query.length > 0) {
        search(query, tissue, cutoff, value);
      }
    });

    $('input[name="query"]').on('keypress', function(e) {
      if (e.which === 13) {
        var tissue = getTissue();
        var cutoff = getCutoff();
        var query = getQuery();
        var value = getValue();
        if (query.length > 0) {
          search(query, tissue, cutoff, value);
        }
      }
    });

    $('.btn-export').on('click', function(e) {
        e.preventDefault();
        var view = $(this).data('view');
        var format = $(this).data('format');
        exportView(view, format);
    });

    $('.btn-heatmap, .btn-browser').on('click', function(e) {
        e.preventDefault();
        toggleView($(this));
    });
});
