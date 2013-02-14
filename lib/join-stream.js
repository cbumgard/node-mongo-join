var Join = require('./join')
  , async = require('async');

var JoinStream = function JoinStream(cursor) {
  Join.call(this, cursor); // inherit from Join
};

JoinStream.prototype.__proto__ = Join.prototype;

JoinStream.prototype.joinFn = function joinFn(cursor, doc, _callback, proxy) {
  this.doJoinScalar(doc, function(err, doc) {
    _callback.call(proxy, err, doc); //TODO handle err?
  });
}

module.exports = JoinStream;