/* global $, google, nv, d3, moment, console */
'use strict';

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

  // GPX File Drop
  // -------------

  // Variable that remembers dropped file
  var droppedFile = null;

  // Configure file drop DOM events
  $('#fileDropZone').on('drop', function(event) {
    event.stopPropagation();
    event.preventDefault();
    $(this).removeClass('fileDropHover');
    
    var files = event.originalEvent.dataTransfer.files;
    
    if (files.length > 0 && files[0].name.split('.').pop().toLowerCase() == 'gpx') {
      $(this)
        .addClass('fileDropAccepted')
        .text('Accepted file: ' + files[0].name);
      droppedFile = files[0];
    } else {
      $('#fileDropError').show().fadeOut(5000);
      droppedFile = null;
    }
  }).on('dragover', function(event){
    event.stopPropagation();
    event.preventDefault();
  }).on('dragenter dragleave', function(event){
    event.stopPropagation();
    event.preventDefault();
    $(this).toggleClass('fileDropHover');
  });

  // Save button on file drop.
  $('#fileDropSave').click(function() {
    if (droppedFile) {
      var reader = new FileReader();
      reader.onload = function(event) {
        console.log('Start plotting file.');
        plotFile(event.target.result);
      };
      console.log('Start reading file.');
      reader.readAsText(droppedFile);
      $('#fileDropZone')
        .removeClass('fileDropAccepted')
        .text('Drop files here');
      
      $('#addTrace').modal('hide');
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
    };

    // Add datapoint.
    var lastMinute = null;
    self.addDataPoint = function(time, point) {
      // Add to polyline
      var path = self.polyLine.getPath();
      path.push(point);
      self.polyLine.setPath(path);

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
  };

  // Function for plotting new traces from GPX data
  var plotFile = function (xml) {
      var trace = new Trace();

      var $xml = $(xml);
      var $trkpts = $xml.children('trk')
                  .children('trkseg').children('trkpt');

      $trkpts.each(function() {
          var lat = $(this).attr('lat');
          var lng = $(this).attr('lon');
          var time = new Date($(this).find('time').text());
          
          var p = new google.maps.LatLng(lat, lng);
          trace.addDataPoint(time, p);
      });

      trace.setTitle($xml.children('trk').children('name').text());
      chart.update();

      console.log('Done.');
    };

  $.ajax({
      type: 'GET',
      url: './my_route.gpx',
      dataType: 'text',
      success: function(txt) {
          plotFile(txt);
      }
  });
});