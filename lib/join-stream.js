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
      self.doJoin(doc, function(err, doc) {
        _callback.call(proxy, err, doc); //TODO handle err?
      });
    };
    proxy.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };
};

JoinStream.prototype.doJoin = function doJoin(doc, fn) {
  var self = this;
  if (!doc) fn(null, null);
  var i = 0, join;
  async.whilst(
    function() { return i < self._on.length },
    function(callback) {
      join = self._on[i++]; // get join opts and increment inner loop
      self.joinDoc(doc, join, function(err, joinedDoc) {
        return callback(null);
      });
    },
    function(err) {
      if (err) console.error('error: %s', err);
      fn(err, doc);
    }
  );
};

module.exports = JoinStream;