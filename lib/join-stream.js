var Join = require('./join')
  , async = require('async');

var JoinStream = function JoinStream(cursor) {
  Join.call(this, cursor); // inherit from Join
};

JoinStream.prototype.__proto__ = Join.prototype;

JoinStream.prototype.proxyNextObject = function(cursor) {
  var self = this;
  var proxy = cursor.nextObject; // original (undecorated) nextObject() fn
  cursor.nextObject = function nextObject(options, callback) { // decorated nextObject() fn
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoinScalar(doc, function(err, doc) {
        _callback.call(proxy, err, doc); //TODO handle err?
      });
    };
    proxy.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };
};

module.exports = JoinStream;