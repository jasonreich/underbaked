var MQTT = function(host, port, clientid) {
  var self = this;

  // An observable that provides a valid connection.
  var connectionObservable = Rx.Observable.create(function (observer) {  
    // Configure for connection.
    var client = new Messaging.Client(host, port, clientid);
    
    // Throw error on connection lost.
    client.onConnectionLost = function(obj) {
      if (obj.errorCode !== 0) {
        observer.onError({event: "connectionLost", obj: obj});
      }
    };
    
    // Connect to client.
    client.connect({
      // Supply client on connect.
      onSuccess: function() {
        observer.onNext(client)
      },
      // Throw error on failure.
      onFailure: function(obj) {
        observer.onError({event: "connectFailure", obj: obj});
      }
    });
    
    // Disconnect on dispose.
    return function() {
      client.disconnect();
    }
  }).publish().refCount();
  self.ConnectionObservable = function() { return connectionObservable; };
  
  
  
  // An observable for a subscription to a topic.
  self.TopicObservable = function(topic) {
    return connectionObservable.selectMany(function (client) {
      client.subscribe
    });
  };
};