/* global $, ko, google, nv, d3 */
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
var Trace = function() {
  var self = this;

  // Static properties
  self.title = 'Hello world';
  self.color = nextColor();
  self.startDate = new Date();

  // Dynamic properties
  self.visible = ko.observable(true);
  self.endDate = ko.observable();
  self.points = ko.observableArray();

  // Calculated properties
  self.startDateView = ko.computed(function() {
    return moment(self.startDate).calendar();
  });
  self.visibleView = ko.computed(function() {
    return self.visible() ? "&#9673;" : "&#9678;";
  });
  self.totalTimeView = ko.computed(function() {
    if (self.endDate()) {
      return moment(self.endDate()).diff(startDate, 'hours', true) + ' hours';
    } else {
      return '<span class="text-success live">LIVE...</span>';
    }
  });

  // Methods
  self.toggleVisible = function() {
    self.visible(!self.visible());
  }
};

// Page ViewModel
var ViewModel = function(map, chart, chartData) {
  var self = this;

  // Traces
  self.traces = ko.observableArray();
  self.addTrace = function() {
    self.traces.push(new Trace());
  };
};

// JQuery onLoad
$(function() {
  // Make panel dragable
  $("#controls").draggable({
    handle: ".panel-heading"
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