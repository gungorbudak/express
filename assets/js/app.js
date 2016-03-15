'use strict';

// base URL to the root with trailing slash
var baseUrl = 'http://localhost/express/';
// a global variable for the browser since
// it will be generated only once
var browser = undefined;
// global spinner and target, actually body element
var target = document.body;
var spinner = new Spinner();

var getLocation = function(query, callback) {
    var parsed = query.trim().match(/^(.*):(.*)-(.*)$/i),
        location = null;

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
            baseUrl, 'api.php',
            '?query=', query, '&format=location'
        ].join('');

        $.get(request, function(data) {
            if (data !== null) {
                location = {
                    chr_name: data['chr_name'].trim(),
                    start: parseInt(data['start']),
                    end: parseInt(data['end'])
                };
            } else {
                // alert user
                alertUser('We couldn\'t find what you were looking for in our database.');
            }
            callback(location);
        });
    }
};

var drawBrowser = function(query) {

    var sources = [{
        name: 'Genome',
        twoBitURI: baseUrl + 'resources/mm10.2bit',
        desc: 'Mouse reference genome build GRCm38',
        tier_type: 'sequence',
        provides_entrypoints: true,
        pinned: true,
    }, {
        name: 'Genes',
        desc: 'Mouse gene structures GENCODE version M7 (GRCm38.p4)',
        bwgURI: baseUrl + 'resources/gencode.vM7.annotation.bb',
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
                chr: location['chr_name'].trim(),
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
                maxHeight: 250,
                fullScreen: false,
                setDocumentTitle: false,
                disablePoweredBy: true,
                noLeapButtons: true,
                noLocationField: true,
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
};

var drawHeatmap = function(tissue, query) {

    spinner.spin(target);

    var request = [
        baseUrl, 'api.php',
        '?tissue=', tissue, '&query=', query
    ].join('');

    d3.json(request, function(data) {
        // data available?
        if (data.length > 0) {
            var stageNum = {}, stageCounter = 0,
                transcriptNum = {}, transcriptCounter = 0;

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

            var transcripts = data.reduce(function(sofar, cur) {
                return sofar.indexOf(cur.transcript) < 0 ? sofar.concat([cur.transcript]) : sofar;
            }, []);

            // var containterSize = document.getElementById('div-heatmap').getBoundingClientRect();

            var margin = { top: 100, right: 0, bottom: 0, left: 200 },
                width = 1200 - margin.left - margin.right,
                // width = containterSize.width - margin.left - margin.right,
                height = (60 * (transcripts.length + 1)) - margin.top - margin.bottom,
                colors = ["#f7fbff","#deebf7","#c6dbef","#9ecae1",
                    "#6baed6","#4292c6","#2171b5","#08519c","#08306b"];

            // fix the shortest height 60
            height = Math.max(height, 60);

            var innerWidth = width + margin.left + margin.right,
                innerHeight = height + margin.top + margin.bottom;

            var cardSize = {
                width: Math.floor(width / stages.length),
                height: Math.floor(height / transcripts.length)
            };

            var container = d3.select("#div-heatmap");

            container.selectAll("*").remove();

            var svg = container.append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", "0 0 " + innerWidth + " " + innerHeight)
                .attr("preserveAspectRatio", "xMinYMid meet");
                // .attr("width", width + margin.left + margin.right)
                // .attr("height", height + margin.top + margin.bottom);

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
                  .style("text-anchor", "middle")
                  .style("fill", "#101010");

            var transcriptLabels = heatmap.selectAll(".label-transcript")
                .data(transcripts)
                .enter().append("text")
                  .text(function (d) { return d; })
                  .attr("x", 0)
                  .attr("y", function (d, i) { return i * cardSize.height; })
                  .attr("transform", "translate(-24," + cardSize.height / 1.65 + ")")
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
                .data(data, function(d) { return transcriptNum[d.transcript] + ':' + stageNum[d.stage]; });

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
                .text(function(d) { return d.value.toFixed(2); })
                .attr("x", function(d) { return xScale(d.stage) + (cardSize.width / 2) - 12; })
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
        }
        spinner.stop();
    });
};

/*
Checks if the browser button in the menu is active
*/
var isBrowser = function() {
    return $('.btn-browser').data('state');
};

/*
Checks if the heatmap button in the menu is active
*/
var isHeatmap = function() {
    return $('.btn-heatmap').data('state');
};

/*
Gets the recently selected tissue from the form
*/
var getTissue = function() {
    var tissue = $('select[name="tissue"]').val();
    return tissue;
};

/*
Gets the recently entered query from the form
*/
var getQuery = function() {
    var query = $('input[name="query"]').val();
    return query;
};

/*
Given any message, alerts the user by adding
an alert box to warnings div in index.html
*/
var alertUser = function(message) {
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
};

var searchOnBrowser = function(query) {
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
};

var search = function() {
    var tissue = getTissue();
    var query = getQuery();
    if (tissue != '' && query != '') {
        if (browser === undefined) {
            drawBrowser(query);
        } else {
            // browser has been initiated, just search
            searchOnBrowser(query);
        }
        if (isHeatmap()) {
            drawHeatmap(tissue, query);
        }
    }
};

var saveData = function(data, type, name) {
    if (data.length > 0) {
        var blob = new Blob([data], {type: type});
        // using FileSaver.js
        saveAs(blob, name);
    } else {
        // alert user
        alertUser('There is no data to export.');
    }
    return;
};

var exportView = function(format) {
    var tissue = getTissue();
    var query = getQuery();

    if (tissue.length > 0 && query.length > 0) {
        if (isHeatmap()) {

            var data = '';
            spinner.spin(target);
            if (format == 'svg') {
                var name = [
                    tissue,
                    query.replace(':', '-'),
                    'heatmap_view.svg'
                ].join('_');
                data = $('#div-heatmap').html().trim();
                saveData(data, 'image/svg+xml', name);
                spinner.stop();

            } else if (format == 'tsv') {

                var request = [
                    baseUrl, 'api.php',
                    '?tissue=', tissue, '&query=', query,
                    '&format=', format
                ].join('');
                $.get(request, function(tsv) {
                    var name = [
                        tissue,
                        query.replace(':', '-'),
                        'heatmap_view.tsv'
                    ].join('_');
                    saveData(tsv, 'text/tsv', name);
                    spinner.stop();

                });
            }
        }
    } else {
        // alert user
        alertUser('There is no data to export.');
    }
};

var toggleSeparator = function() {
    var $hrSeparator = $('#hr-separator'),
        tissue = getTissue(),
        query = getQuery(),
        btnBrowserState = $('.btn-browser').data('state'),
        btnHeatmapState = $('.btn-heatmap').data('state');

    if (btnBrowserState && btnHeatmapState &&
        tissue.length > 0 && query.length > 0) {
        $hrSeparator.removeClass('hidden');
    } else {
        $hrSeparator.addClass('hidden');
    }
};

var toggleView = function($btn) {
    var $div = $('#div-' + $btn.get(0).className.split('-')[1]);

    $btn.data('state', !$btn.data('state'));
    $btn.parent().toggleClass('active');
    if ($btn.data('state')) {
        $div.removeClass('hidden');
    } else {
        $div.addClass('hidden');
    }

    toggleSeparator();
};

$(document).ready(function() {
    $('button[name="search"]').on('click', function(e) {
        e.preventDefault();
        search();
    });
    $('input[name="query"]').on('keypress', function (e) {
        if (e.which === 13) {
            search();
        }
    });
    $('.btn-export').on('click', function(e) {
        e.preventDefault();
        var format = $(this).data('format');
        exportView(format);
    });
    $('.btn-heatmap, .btn-browser').on('click', function(e) {
        e.preventDefault();
        toggleView($(this));
    });
});
