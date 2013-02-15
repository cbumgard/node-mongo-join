var Join = require('./join')
  , async = require('async');

var JoinStream = function JoinStream(cursor) {
  Join.call(this, cursor); // inherit from Join
};

JoinStream.prototype.__proto__ = Join.prototype;

/**
 * Override the join function to work on a single (scalar) document
 * which is passed as the next document by the CursorStream.
 * @param  {Cursor}   cursor    Cursor supplying this stream
 * @param  {Object}   doc       Next doc in the stream that will be joined to secondary docs
 * @param  {Function} _callback Original callback for nextObject() that gets decorated
 * @param  {Function} proxy     Proxy to the cursor's nextObject() method
 * @return {None}               Modifies the doc in place (side-effect)
 */
JoinStream.prototype.joinFn = function joinFn(cursor, doc, _callback, proxy) {
  //TODO: do this without side-effect of mutating original doc?
  this.doJoinScalar(doc, function(err, doc) {
    _callback.call(proxy, err, doc); //TODO handle err?
  });
}

// Exported interface:
module.exports = JoinStream;