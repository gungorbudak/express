'use strict';

// base URL to the root with trailing slash
var baseUrl = 'http://localhost/express/';

var drawBrowser = function(tissue, query) {

};

var drawHeatmap = function(tissue, query) {

    var target = document.body;
    var spinner = new Spinner().spin(target);

    var request = [
        baseUrl, 'api.php',
        '?tissue=', tissue, '&query=', query
    ].join('');

    d3.json(request, function(data) {

        spinner.stop();
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

        var containterSize = document.getElementById('view').getBoundingClientRect();

        var margin = { top: 100, right: 0, bottom: 0, left: 200 },
            width = containterSize.width - margin.left - margin.right,
            height = (60 * (transcripts.length + 1)) - margin.top - margin.bottom,
            colors = ["#f7fbff","#deebf7","#c6dbef","#9ecae1",
                "#6baed6","#4292c6","#2171b5","#08519c","#08306b"];

        // fix the shortest height 60
        height = Math.max(height, 60);

        var cardSize = {
            width: Math.floor(width / stages.length),
            height: Math.floor(height / transcripts.length)
        };

        var container = d3.select("#view");

        container.selectAll("*").remove();

        var svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

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
    });
};

var clickEvent = new MouseEvent('click', {
    'view': window,
    'bubbles': true,
    'cancelable': false
});

var isBrowser = function() {
    return $('.btn-browser').data('state');
};

var isHeatmap = function() {
    return $('.btn-heatmap').data('state');
};

var getTissue = function() {
    var tissue = $('select[name="tissue"]').val();
    return tissue;
};

var getQuery = function() {
    var query = $('input[name="query"]').val();
    return query;
}

var search = function() {
    var tissue = getTissue();
    var query = getQuery();
    if (tissue != '' && query != '') {
        if (isBrowser()) {
            drawBrowser(tissue, query);
        }
        if (isHeatmap()) {
            drawHeatmap(tissue, query);
        }
    }
};

var exportView = function(format) {
    if (isHeatmap()) {
        if (format == 'svg') {
            var download = [
                tissue,
                query.replace(':', '-'),
                'view.svg'
            ].join('_');
            var svg = $('#view').html().trim();
            if (svg.length > 0) {
                var a = document.createElement('a');
                var data = new Blob([svg], {type: 'image/svg+xml'});
                a.href = window.URL.createObjectURL(data);
                a.setAttribute('download', download);
                a.dispatchEvent(clickEvent);
                a.remove();
            }
        } else if (format == 'tsv') {
            var tissue = getTissue();
            var query = getQuery();
            var request = [
                baseUrl, 'api.php',
                '?tissue=', tissue, '&query=', query, '&format=', format
            ].join('');
            $.get(request, function(tsv) {
                var download = [
                    tissue,
                    query.replace(':', '-'),
                    'view.tsv'
                ].join('_');
                var a = document.createElement('a');
                var data = new Blob([tsv], {type: 'text/tsv'});
                a.href = window.URL.createObjectURL(data);
                a.setAttribute('download', download);
                a.dispatchEvent(clickEvent);
                a.remove();
            });
        }
    } else {

    }
};

var toggleView = function($view) {
    $view.data('state', !$view.data('state'));
    $view.parent().toggleClass('active');
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
    $('.btn-heatmap').on('click', function(e) {
        e.preventDefault();
        toggleView($(this));
    });
    $('.btn-browser').on('click', function(e) {
        e.preventDefault();
        toggleView($(this));
    });
});
