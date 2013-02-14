var async = require('async');

var Join = function Join(cursor) {
  var self = this;
  self._cursor = cursor;  
  self.proxyNextObject(cursor);
  self._on = [];
};

Join.prototype.joinFn = function joinFn(cursor, doc, _callback, proxy) {
  //TODO: do this without side-effect of mutating original doc?
  this.doJoinArray(cursor.items, function(err, doc) {
    _callback.call(proxy, err, doc); //TODO handle err?
  });  
}

Join.prototype.proxyNextObject = function proxyNextObject (cursor) {
  var self = this;
  var proxy = cursor.nextObject; // original (undecorated) nextObject() fn
  cursor.nextObject = function nextObject(options, callback) { // decorated nextObject() fn
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.joinFn(cursor, doc, _callback, proxy); // joinFn differs in JoinStream subclass
    };
    proxy.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };
};

Join.prototype.doJoinArray = function doJoin(items, fn) {
  var self = this;
  if (!items || items.length === 0) fn(null, null);
  var counter = 0;
  async.whilst(
    function() { return counter < items.length },
    function(callback) {
      self.doJoinScalar(items[counter], function(err) {
        counter++;
        callback(err);
      });
    },
    function(err) {
      if (err) console.error('error: %s', err);
      return fn(err, items);
    }
  );
};

Join.prototype.doJoinScalar = function doJoin(doc, fn) {
  var self = this;
  if (!doc) fn(null, null);
  var counter = 0;
  async.whilst(
    function() { return counter < self._on.length },
    function(callback) {
      self.joinDoc(doc, self._on[counter], function(err) {
        counter++;
        callback(err);
      });
    },
    function(err) {
      if (err) console.error('error: %s', err);
      fn(err, doc);
    }
  );
};

Join.prototype.joinDoc = function joinDoc(doc, join, fn) {
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

Join.prototype.on = function on(opts) {
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

Join.prototype.cursor = function cursor() {
  return this._cursor;
}

module.exports = Join;