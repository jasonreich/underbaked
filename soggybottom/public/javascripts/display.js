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
  
  // Send command (requires connection)
  var sendCommand = function (obj) {
    var message = new Messaging.Message(JSON.stringify(obj));
    message.destinationName = "/command/";
    message.qos = 1;
    mqttClient.send(message); 
  };
  
  // Add trace
  // ---------

  // Add Trace form validity
  var isAddTraceFormValid = function() {
    // Page 2: Can only view in full if loading from disk.
    if ($('#telemetryViewRadioPartial').prop('checked')) {
      if ($('#telemetrySourceRadioLocal').prop('checked')) {
        return 'Cannot replay trace without first uploading to server.';
      }
    } 
    
    // Page 3: Tick and output MQTT on replay
    var isReplaying = 
      $('#telemetrySourceRadioRemote').prop('checked') &&
      $('#telemetryViewRadioPartial').prop('checked');
    $('#telemetryTargetMQTT').prop('checked', isReplaying);
    $('#mqttTarget').val(isReplaying ? $('#remoteID').val() : "");
  
    // Page 1: Are boxes filled?
    if ($('#telemetrySourceRadioLocal').prop('checked')) {
      if ($('#uploadFile').get(0).files.length !== 1) {
        return 'No source file selected.';
      }
    } else if ($('#telemetrySourceRadioRemote').prop('checked')) {
      if (! $('#remoteID').val()) {
        return 'No CouchDB source ID entered.';
      }
    } else if ($('#telemetrySourceRadioMQTT').prop('checked')) {
      if (! $('#mqttSource').val()) {
        return 'No MQTT source topic entered.';
      }
    } 
    
    // Page 2: Are boxes filled?
    /* if ($('#telemetryViewRadioPartial').prop('checked')) {
      if (! $('#startTimePartial').val()) {
        return 'No start time entered.';
      }
    } */
    
    // Page 3: Are boxes filled?
    if ($('#telemetryTargetCouchDB').prop('checked')) {
      if (! $('#storeID').val()) {
        return 'No couch DB storage ID entered.';
      }
    } else if ($('#telemetryTargetMQTT').prop('checked')) {
      if (! $('#mqttTarget').val()) {
        return 'No MQTT topic topic entered.';
      }
    } 
  };
  
  $('#addAccordian').change(function() {
    var isValid = isAddTraceFormValid();
    if (isValid) {
      $('#validationError').text(isValid);
    } else {
      $('#validationError').text("");
    }
  });
  
  var doSource = function() {
    if ($('#telemetrySourceRadioLocal').prop('checked')) {
      // Load the file from disk
      var reader = new FileReader();
      reader.onload = function(event) {
        doTarget(parseGPX(event.target.result), null);
      }
      reader.readAsText($('#uploadFile').get(0).files[0]);
    } else if ($('#telemetrySourceRadioRemote').prop('checked')) {
      var topicSegment = $('#remoteID').val();
      if ($('#telemetryViewRadioFull').prop('checked')) {
        $.ajax({
          url: '/db/traces/_design/TraceDesign/_view/getTraceByTopic?key=' 
               + encodeURIComponent('"' + topicSegment + '"'),
          type: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          success: function(traceData) {
            if (traceData.total_rows == 1) {
              $.ajax({
                url: '/db/points/_design/PointsDesign/_view/getPointsByTopic?key=' 
                     + encodeURIComponent('"' + topicSegment + '"'),
                type: 'GET',
                contentType: 'application/json',
                dataType: 'json',
                success: function(pointsData) {
                  var history = {
                    title: traceData.rows[0].value.title,
                    startTst: traceData.rows[0].value.startTst,
                    endTst: traceData.rows[0].value.endTst,
                    points: []
                  };
                  
                  pointsData.rows.forEach( function(item) {
                    history.points.push(item.value);
                  });
                  
                  doTarget(history, null);
                }
              });
            };
          }
        });
      } else if ($('#telemetryViewRadioPartial').prop('checked')) {
        var history = {
          title: '/replay/' + topicSegment,
          points: []
        };
        sendCommand({command: 'load', topic: topicSegment});
        sendCommand({command: 'start', topic: topicSegment});
        doTarget(history, topicSegment);
      }
    } else if ($('#telemetrySourceRadioMQTT').prop('checked')) {
      var mqttTopic = $('#mqttSource').val();
      var history = {
        title: mqttTopic,
        startDate: moment().format('X'),
        points: []
      };
      doTarget(history, mqttTopic);
    }
  };
  
  var doTarget = function(history, mqttTopic) {
    if ($('#telemetryTargetCouchDB').prop('checked')) {
      var traceID = $('#storeID').val();
      var points = [];
      history.points.forEach(function(item) {
        // item._id = traceID + '_' + item.tst;
        item.topic = traceID;
        points.push(item);
      });
      
      console.log('POSTing bulk points data.');
      $.ajax({
        url: '/db/points/_bulk_docs',
        type: 'POST',
        data: JSON.stringify({docs: points}),
        contentType: 'application/json',
        dataType: 'json',
        complete: function(jqXHR, textStatus) {
          console.log('Points: ');
          console.log(textStatus);
        }
      });
      
      $.ajax({
        url: '/db/traces',
        type: 'POST',
        data: JSON.stringify({
          startTst:  history.startDate,
          endTst:  history.endDate,
          title:  history.title,
          topic: traceID
        }),
        contentType: 'application/json',
        dataType: 'json',
        complete: function(jqXHR, textStatus) {
          console.log('Trace: ');
          console.log(textStatus);
        }
      });
    }
    
    if ($('#telemetryTargetMap').prop('checked')) {
      var trace = plotArchive(history);
      if (mqttTopic) {
        console.log('Subscribing to ' + mqttTopic);
        trace.subscribeFeed(mqttTopic);
      } else {
        trace.finishFeed();
      }
    } 
    
    // Finally, hide dialog.
    $('#addTrace').modal('hide');
  };
  
  // Save button on add trace.
  $('#addTraceSave').click(function() {
    if (!isAddTraceFormValid()) {
      doSource();
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
    var totalCell = $('<td class="text-success"></td>');
    var playPause = $('<button type="button" class="btn btn-primary btn-xs"><span class="glyphicon glyphicon-pause"></span> Pause</button>');
    totalCell.append(playPause);
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
    var traceID;
    self.subscribeFeed = function(_traceID) {
      traceID = _traceID;
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
      var delta = moment(lastMinute.time).diff(self.startTime, 'hours', true).toFixed(2);
      nameCell.removeClass('text-success');
      totalCell.text(delta + ' hours').removeClass('text-success');
    };
    
    // Toggle a replay
    var isRunning = true;
    self.toggleReplay = function() {
      isRunning = !isRunning;
      sendCommand({'command': isRunning ? 'start' : 'pause', 'topic': traceID});
      if (!isRunning) {
        playPause.html('<span class="glyphicon glyphicon-play"></span> Play');
      } else {
        playPause.html('<span class="glyphicon glyphicon-pause"></span> Pause');
      }
      return isRunning;
    };
    playPause.click(self.toggleReplay);
  };

  // Parse a GPX file
  var parseGPX = function(txt) {
    var $xml = $(txt);
    var $trkpts = $xml.children('trk')
                .children('trkseg').children('trkpt');

    var startDate, endDate;
    var points = [];

    $trkpts.each(function() {
        var lat = $(this).attr('lat');
        var lon = $(this).attr('lon');
        var tst = moment($(this).find('time').text()).format('X');

        if (!startDate) startDate = tst;
        endDate = tst;
        points.push({tst: tst, lat: lat, lon: lon});
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
      var point = new google.maps.LatLng(item.lat, item.lon);
      trace.addDataPoint(moment.unix(item.tst), point);
    });

    trace.setTitle(data.title);
    chart.update();
    console.log('Done.');

    return trace;
  };
  
  // Load CouchDB traceIDs
  var loadTraceIDs = function() {
    $.ajax({
          url: '/db/traces/_design/TraceDesign/_view/getTopics',
          type: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          success: function(data) {
            var idList = $('#traceIDList');
            idList.html('');
          
            data.rows.forEach(function(item) {
              var idItem = $('<li><a href="#">' + item.value + '</a></li>');
              idItem.appendTo(idList);
              idItem.click(function(event) {
                $('#remoteID').val(item.value);
              });
            });
          }
        });
  };
  loadTraceIDs();
  $('#remoteIDButton').mouseenter(loadTraceIDs);
});