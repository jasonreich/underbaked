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

  // Plotting traces
  // ===============
  
  // Function for plotting new traces from GPX data
  var plotFile = function (xml) {
      var points = [];
      var bounds = new google.maps.LatLngBounds();
      var tempChartData = [];

      var $xml = $(xml);
      var $trkpts = $xml.children('trk')
                  .children('trkseg').children('trkpt');
      var startTime = $trkpts.first().find('time').text();

      var queue = [];
      var lastMinutes = -1;
      $trkpts.each(function() {
          var lat = $(this).attr('lat');
          var lng = $(this).attr('lon');
          var time = new Date($(this).find('time').text());
          
          var p = new google.maps.LatLng(lat, lng);
          bounds.extend(p);
          points.push(p);

          queue.push({p: p, time: time});

          var windowSize = 60;
          if (windowSize <= queue.length) {
              var distance = 0;
              for(var i=0; i < windowSize - 1; i++) {
                  var p0 = queue[i].p;
                  var p1 = queue[i+1].p;
                  distance += google.maps.geometry.spherical
                      .computeDistanceBetween(p0, p1) / 1000;
              }

              var minutes = moment(time).diff(startTime, 'minutes', true);
              var old = queue.shift();
              var timeDelta = moment(time).diff(old.time, 'hours', true);

              var speed = distance / timeDelta;
              if (1 <= minutes - lastMinutes) {
                tempChartData.push({x: minutes, y: speed});
                lastMinutes = minutes;
              }
          }
      });

      var thisColor = nextColor();
      var poly = new google.maps.Polyline({
          path: points,
          strokeColor: thisColor,
          strokeOpacity: 0.7,
          strokeWeight: 4
      });
      
      
      var traceName = $xml.children('trk').children('name').text();
      chartData.push({
          values: tempChartData,
          key: traceName,
          color: thisColor
      });
      chart.update();
      
      poly.setMap(map);
      map.fitBounds(bounds);

      var endTime = $trkpts.last().find('time').text();

      var totalTime = moment(endTime).diff(startTime, 'hours', true)
                    .toFixed(2);
      $('#traceListing').append(
          $('<tr>')
              .append($('<td class="symbol">').html('&#9679;')
                  .css('color', thisColor))
              .append($('<td>').text(traceName))
              .append($('<td>').text(moment(startTime).calendar()))
              .append($('<td>').text(totalTime + ' hours'))
      );
      
      console.log('Done.'); };

  $('#fileDropSave').click(function() {
    if (droppedFile) {
      var reader = new FileReader();
      reader.onload = function(event) {
        console.log('Start plotting file.');
        plotFile(event.target.result);
      };
      console.log('Start reading file.');
      reader.readAsText(droppedFile);
      
      $('#addTrace').modal('hide');
    }
  });

  // $.ajax({
  //     type: 'GET',
  //     url: './my_route.gpx',
  //     dataType: 'text',
  //     success: function(txt) {
  //         plotFile(txt);
  //     }
  // });

  // Initialise timeline
  var stepInterval;
  $('#playPause_play').click(function() {
    if (!stepInterval) {
      stepInterval = window.setInterval(function() {
        var min = parseInt($('#timeMin').val());
        var sec = parseInt($('#timeSec').val()) + 1;

        if (sec >= 60) {
          min += Math.floor(sec / 60);
          sec = sec % 60;
        }

        $('#timeMin').val(min);
        $('#timeSec').val(sec);
      }, 1000);
      $('#timeGroup')
        .removeClass('has-error')
        .addClass('has-success');
    }
  });

  $('#playPause_pause').click(function() {
    if (stepInterval) {
      window.clearInterval(stepInterval);
      stepInterval=null;
      $('#timeGroup')
        .addClass('has-error')
        .removeClass('has-success');
    }
  });

  $('#controls').draggable({
    handle: '.panel-heading'
  });
});