/* global $, google, nv, d3, moment, console, Messaging */
'use strict';

// Wait until document load.
$(function() {
  // Initialise Globals
  // ==================

  // Google Maps
  // -----------
  // Google Maps object, centred on York.
  var map = new google.maps.Map($('#mapCanvas').get(0), {
    center: new google.maps.LatLng(53.958333, -1.080278),
    zoom: 11
  });

  // Trace Colors
  // ------------
  // Function that returns next color from cyclical queue.
  var nextColor = (function() {
    var colorQueue = ['#E84A21', '#5BFF75', '#FFF84E', '#E80C7A', '#1146FF'];
    return function() {
      var temp = colorQueue.shift();
      colorQueue.push(temp);
      return temp;
    };
  })();

  // Add trace
  // ---------

  // Save button on add trace.
  $('#addTraceSave').click(function() {
    // If completed upload form.
    if ($('#collapseUpload').hasClass('in') &&
        $('#uploadFile').get(0).files &&
        $('#uploadFile').get(0).files.length > 0 )  {
      var reader = new FileReader();
      reader.onload = function(event) {
        console.log('Start plotting file.');
        var parsed = parseGPX(event.target.result);
        var trace = plotArchive(parsed);
        trace.finishFeed();
        if($('#uploadID').val() !== '') {

        }
      };
      console.log('Start reading file.');
      reader.readAsText($('#uploadFile').get(0).files[0]);
      $('#addTrace').modal('hide');
    // If completed collect form.
    } else if ($('#collapseCollect').hasClass('in')) {

    // If completed upload form.
    } else if ($('#collapseReplay').hasClass('in')) {

    }
  });

  // Speed vs. Time Chart
  // --------------------

  // Chart object.
  var chart;

  // Chart data object.
  var chartData = [];

  // Create chart.
  nv.addGraph(function() {
    chart = nv.models.lineChart()
      .options({
        x: function(d,i) { return i; },
        showXAxis: true,
        showYAxis: true,
        showLegend: false,
        transitionDuration: 250,
        useInteractiveGuideline: true
      });

    chart.xAxis
      .axisLabel('Minutes')
      .tickFormat(d3.format('d'));

    chart.yAxis
      .axisLabel('Speed (km/h)')
      .axisLabelDistance(30)
      .tickFormat(d3.format('.02f'));

    d3.select('#chart_div svg')
      .datum(chartData)
      .call(chart);

    nv.utils.windowResize(chart.update);

    return chart;
  });

  // Dragable Panel
  // --------------
  // Use JQuery UI to drag panel
  $('#controls').draggable({
    handle: '.panel-heading'
  });

  // MQTT Client
  // -----------

  // Generate a five character client ID suffix.
  var clientID = (function() {
    var id = 'viewer-';
    for(var i = 0; i < 10; i++) {
      id += Math.floor(Math.random() * 16).toString(16);
    }
    return id;
  })();

  // Dictionary for message handlers.
  var handlerDictionary = {};

  // Initialise a conneciton to the MessageSight broker.
  var mqttClient = new Messaging.Client('5.153.17.246', 13531, clientID);
  console.log('Connecting with client ID: ' + clientID);
  mqttClient.connect({
    onSuccess: function() {
      console.log('MQTT Client Connected');
      mqttClient.subscribe('/test/debug');
    }
  });

  // On message arrival, lookup trace in dictionary for handler.
  mqttClient.onMessageArrived = function(msg) {
    var dest = msg.destinationName;
    if (dest.indexOf('/trace/') === 0) {
      var traceID = dest.substr('/trace/'.length);
      if (traceID in handlerDictionary) {
        handlerDictionary[traceID](JSON.parse(msg.payloadString));
      } else {
        console.log('Unknown traceID: ' + traceID);
      }
    } else {
      console.log('Unknown topic:');
      console.log(msg);
    }
  };

  // Plotting traces
  // ===============
  // Bounds for map data.
  var mapBounds = new google.maps.LatLngBounds();

  // Trace Class
  // -----------
  var Trace = function() {
    var self = this;

    // Color representing this trace.
    var color = nextColor();

    // Table row for this trace.
    var symbolCell = $('<td class="symbol">').html('&#9679;')
                   .css('color', color);
    var nameCell = $('<td class="text-success">Loading...</td>');
    var startCell = $('<td>');
    var totalCell = $('<td class="text-success">Live</td>');
    $('#traceListing').append(
      $('<tr>').append(symbolCell, nameCell, startCell, totalCell)
    );

    // Polyline for Google Maps.
    self.polyLine = new google.maps.Polyline({
      strokeColor: color,
      strokeOpacity: 0.7,
      strokeWeight: 4,
      map: map
    });

    // Marker for Google Maps.
    var iconUrl = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|' + color.substr(1);
    self.marker = new google.maps.Marker({
      title: 'Loading',
      icon: iconUrl,
      map: map
    });

    // Chart data for nvd3.
    self.seriesData = {
      values: [],
      key: 'Loading...',
      color: color
    };
    chartData.push(self.seriesData);

    // Change title of the trace.
    self.setTitle = function(title) {
      nameCell.text(title);
      self.seriesData.key = title;
      self.marker.setTitle(title);
    };

    // Add datapoint.
    var lastMinute = null;
    self.addDataPoint = function(time, point) {
      // Add to polyline
      var path = self.polyLine.getPath();
      path.push(point);
      self.polyLine.setPath(path);

      // Move marker
      self.marker.setPosition(point);

      // If initial datapoint, set start-time
      if (path.length === 1) {
        self.startTime = moment(time);
        startCell.text(self.startTime.calendar());
      }

      // Extend map bounds
      mapBounds.extend(point);
      map.fitBounds(mapBounds);

      // Add to Speed vs. Time graph.
      if (lastMinute) {
        if (1 <= moment(time).diff(lastMinute.time, 'minutes', true)) {
          var timeDelta = moment(time).diff(lastMinute.time, 'hours', true);
          var distDelta = google.maps.geometry.spherical
                        .computeDistanceBetween(lastMinute.point, point) / 1000;
          var speed = distDelta / timeDelta;

          self.seriesData.values.push({
            x: moment(lastMinute.time).diff(self.startTime, 'minutes', true),
            y: speed
          });
          lastMinute = {time: time, point: point};
        }
      } else {
        lastMinute = {time: time, point: point};
      }
    };

    // Subscribe to live feed
    self.subscribeFeed = function(traceID) {
      handlerDictionary[traceID] = function(obj) {
        self.addDataPoint(
          moment.unix(obj.tst),
          new google.maps.LatLng(obj.lat, obj.lon)
        );
        chart.update();
      };
      mqttClient.subscribe('/trace/' + traceID);
    };

    // Finish a live feed
    self.finishFeed = function() {
      var delta = moment(lastMinute.time).diff(self.startTime, 'hours', true);
      nameCell.removeClass('text-success');
      totalCell.text(delta + ' hours').removeClass('text-success');
    };
  };

  // Parse a GPX file
  var parseGPX = function(txt) {
    var $xml = $(txt);
    var $trkpts = $xml.children('trk')
                .children('trkseg').children('trkpt');

    var startDate, endDate;
    var points = [];

    $trkpts.each(function() {
        var lat   = $(this).attr('lat');
        var lng   = $(this).attr('lon');
        var time  = moment($(this).find('time').text()).format('X');
        var point = new google.maps.LatLng(lat, lng);

        if (!startDate) startDate = time;
        endDate = time;
        points.push({time: time, point: point});
    });

    return {
      title: $xml.children('trk').children('name').text(),
      startDate: startDate,
      endDate: endDate,
      points: points
    };
  };

  // Function for plotting new traces from archive telemetry data
  var plotArchive = function(data) {
    var trace = new Trace();

    data.points.forEach(function(item) {
      trace.addDataPoint(moment.unix(item.time), item.point);
    });

    trace.setTitle(data.title);
    chart.update();
    console.log('Done.');

    return trace;
  };
});