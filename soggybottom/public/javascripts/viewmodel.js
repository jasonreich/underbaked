/* global $, ko, google, nv, d3, moment */
'use strict';

// Color pallet
var nextColor = (function() {
  var colorSet = ['#E84A21', '#5BFF75', '#FFF84E', '#E80C7A', '#1146FF'];
  return function() {
    var temp = colorSet.shift();
    colorSet.push(temp);
    return temp;
  };
})();

// Trace ViewModels
var Trace = function(map) {
  var self = this;

  // Plain properties
  self.color = nextColor();
  var poly = new google.maps.Polyline({
      strokeColor: self.color,
      strokeOpacity: 0.7,
      strokeWeight: 4,
      map: map
  });

  // Knockout properties
  self.title = ko.observable('Loading...');
  self.startDate = ko.observable(new Date());
  self.endDate = ko.observable();
  self.points = ko.observableArray();
  self.visible = ko.observable(true);

  // Calculated properties
  self.startDateView = ko.computed(function() {
    return moment(self.startDate()).calendar();
  });
  self.visibleView = ko.computed(function() {
    return self.visible() ? '&#9673;' : '&#9678;';
  });
  self.totalTimeView = ko.computed(function() {
    if (self.endDate()) {
      return moment(self.endDate()).diff(self.startDate(), 'hours', true) + ' hours';
    } else {
      return '<span class="text-success live">LIVE...</span>';
    }
  }); /*
  self.pointsPolyView = ko.computed(function() {
    return $.map(self.points(), function(obj) {
      return obj.p;
    });
  });
  self.pointsSpeedView = ko.computed(function() {
    var timeSeries = [];
    var windowTime = 60;
    var objQueue = [];
    self.points().forEach(function(obj) {
      objQueue.push(obj);
      var timeDelta = moment(objQueue[0].time).diff(obj.time, 'seconds', true);
      if(objQueue.length > 2 && windowTime <= timeDelta) {
        var oldObj = objQueue.shift();
        var distance = google.maps.geometry.spherical
            .computeDistanceBetween(oldObj.p, obj.p) / 1000;
        var minutes = moment(oldObj.time).diff(self.startTime(), 'minutes', true);
        timeSeries.push({x: minutes, y : distance / timeDelta});
      }
    });
    return timeSeries;
  }); */

  // Methods
  self.toggleVisible = function() {
    self.visible(!self.visible());
  };

  // Subscriptions
  // self.pointsPolyView.subscribe(function(newValue) {
  //   poly.setPath(newValue);
  // });
  // self.visible.subscribe(function(newValue) {
  //   poly.setOptions({strokeOpacity : newValue ? 0.7 : 0.4});
  // });

  console.log("Start load.");
  $.ajax({
      type: 'GET',
      url: './my_route.gpx',
      dataType: 'text',
      success: function(xml) {
        console.log("Start parse.");
        var $xml = $(xml);
        var $trkpts = $xml.children('trk')
                    .children('trkseg').children('trkpt');
        self.startDate(new Date($trkpts.first().find('time').text()));

        $trkpts.each(function() {
          var lat = $(this).attr('lat');
          var lng = $(this).attr('lon');
          var time = new Date($(this).find('time').text());
          var p = new google.maps.LatLng(lat, lng);
          self.points.push({time: time, p: p});
        });
      }
  });
};

// Page ViewModel
var ViewModel = function(map, chart, chartData) {
  var self = this;

  // Traces
  self.traces = ko.observableArray();
  self.addTrace = function() {
    self.traces.push(new Trace(map));
  };
};

// JQuery onLoad
$(function() {
  // Make panel dragable
  $('#controls').draggable({
    handle: '.panel-heading'
  });

  // Initialise map
  var map = new google.maps.Map($('#mapCanvas').get(0), {
    center: new google.maps.LatLng(53.958333, -1.080278),
    zoom: 11
  });

  // Initialise chart
  var chart;
  var chartData = [];
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

  // Initialise knockout bindings
	ko.applyBindings(new ViewModel(map, chart, chartData));
});