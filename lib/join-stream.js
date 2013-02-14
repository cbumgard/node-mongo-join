var async = require('async');

var JoinStream = function Join(cursor) {
  var self = this;
  self._cursor = cursor;
  self._on = [];
  var _nextObject = cursor.nextObject; // original (undecorated) nextObject() fn
  var joinNextObject = function nextObject(options, callback) { // decorated nextObject() fn
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoin(doc, function(err, joinedDoc) {
        _callback.call(_nextObject, err, joinedDoc); //TODO handle err?
      });
    };
    _nextObject.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };
  cursor.nextObject = joinNextObject;
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

JoinStream.prototype.joinDoc = function joinDoc(doc, join, fn) {
  var self = this;
  if (!doc) {
    return fn(null, null);
  }  
  var val = doc[join.field];
  if (!val) return fn(null, null); // no doc match, i.e. this doc doesn't have the 'on' field.
  self._cursor.db.collection(join.from, function(err, collection) {
    if (err) return fn(err, null);
    var query = {};
    query[join.to] = val;
    collection.findOne(query, function(err, item) {
      if (err) return fn(err, null);
      if (!item) return fn(err, doc);
      doc[join.as] = item;
      return fn(null, doc);
    });
  });
}

JoinStream.prototype.on = function on(opts) {
  var isValid = opts 
    && opts.hasOwnProperty('field')
    && opts.hasOwnProperty('to')
    && opts.hasOwnProperty('from');
  if (!isValid) throw new Error('requires object param containing "field", "to", and "from"');
  // If no field specified to store the joined document, store in the original
  // field that contained the reference to the other document:
  if (!opts.hasOwnProperty('as')) opts.as = opts.field;
  this._on.push(opts);
  return this;
};

JoinStream.prototype.cursor = function cursor() {
  return this._cursor;
}

module.exports = JoinStream;