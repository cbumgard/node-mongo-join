var async = require('async');

var Join = function Join(cursor) {
  var self = this;
  self._cursor = cursor;  
  self._on = [];
  var _nextObject = cursor.nextObject; // original (undecorated) nextObject() fn
  var joinNextObject = function nextObject(options, callback) { // decorated nextObject() fn
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoin(cursor.items, function(err, doc) {
        _callback.call(_nextObject, err, doc); //TODO handle err?
      });
    };
    _nextObject.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };
  cursor.nextObject = joinNextObject;
};

Join.prototype.doJoin = function doJoin(items, fn) {
  var self = this;
  if (!items || items.length === 0) fn(null, null);
  var joinedItems = [];
  var d = 0, doc;
  async.whilst(
    function() { return d < items.length },
    function(callback) {
      var i = 0, join; // on, to, from, as;
      doc = items[d];
      async.whilst(
        function() { return i < self._on.length },
        function(innerCallback) {
          join = self._on[i++]; // get join opts and increment inner loop
          self.joinDoc(doc, join, function(err, joinedDoc) {
            if (joinedDoc) joinedItems.push(joinedDoc);
            innerCallback(err);
          });
        },
        function(err) {
          if (err) console.error('error: %s', err);
          d++; // outer loop (document list)
          callback(err);
        }
      );
    },
    function(err) {
      if (err) console.error('error: %s', err);
      return fn(null, joinedItems);
    }
  );
};

Join.prototype.joinDoc = function joinDoc(doc, join, fn) {
  var self = this;
  var val = doc[join.field];
  if (!val) return fn(null, null); // no doc match, i.e. this doc doesn't have the 'on' field.
  self._cursor.db.collection(join.from, function(err, collection) {
    if (err) return fn(err, null);
    var query = {};
    query[join.to] = val;
    collection.findOne(query, function(err, item) {
      if (err) return fn(err, null);
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