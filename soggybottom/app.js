
/**
 * Module dependencies.
 */

var express = require('express');
var request = require('request');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(function(req, res, next){
  var proxy_path = req.path.match(/^\/db(.*)$/);
  if(proxy_path){
    var db_url = 'http://admin:M4RhzmKKkQYg@173.192.123.18:5984' + proxy_path[1];
    req.pipe(request({
      uri: db_url,
      method: req.method
    })).pipe(res);
  } else {
    next();
  }
});
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/mqtc/:liveID', function(req, res) {
  res.attachment('conf.mqtc');
  res.json({
    "_type": "configuration",
    "deviceid": "iphone",
    "clientid": req.params.liveID,
    "subscription": "/test/debug",
    "topic": "/live/" + req.params.liveID,
    "host": "5.153.17.246",
    "user": "tracker",
    "pass": "tracker",
    "subscriptionqos": "1",
    "qos": "1",
    "port": "13531",
    "keepalive": "60",
    "retain": "false",
    "tls": "0",
    "auth": "1",
    "clean": "0",
    "willretain": "0",
    "mindist": "1",
    "mintime": "5",
    "monitoring": "2",
    "ab": "0"
  });
})

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
