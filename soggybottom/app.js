
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
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
