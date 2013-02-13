var async = require('async');

var Join = function Join(cursor) {
  var self = this;
  self._on = [];
  self._to = [];
  self._from = [];
  self._as = [];

  var _nextObject = cursor.nextObject; // original (undecorated) nextObject() fn
  cursor.nextObject = function nextObject(options, callback) { // decorated nextObject() fn
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoin(cursor.items, function(err, doc) {
        _callback.call(_nextObject, err, doc); //TODO handle err
      });
    };
    _nextObject.call(cursor, options, callback); // requires cursor instance as 'this' for cursor state
  };

  var _getMore = cursor.getMore; // original (undecorated) getMore() fun
  cursor.getMore = function getMore(_self, options, callback) {
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }  
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoin(cursor.items, function(err, doc) {
        _callback.call(_getMore, err, doc); //TODO handle err
      });
    };
    _getMore.call(cursor, _self, options, callback); // requires cursor instance as 'this' for cursor state      
  };

  var _toArrayExhaust = cursor.toArrayExhaust;
  cursor.toArrayExhaust = function(_self, callback) {
    var _callback = callback; // original (undecorated) callback() fn
    callback = function(err, doc) { // decorated callback() fn
      self.doJoin(cursor.items, function(err, doc) {
        _callback.call(_toArrayExhaust, err, doc); //TODO handle err
      });
    };    
    _toArrayExhaust.call(cursor, _self, callback);
  };

  self._cursor = cursor;
};

Join.prototype.doJoin = function doJoin(items, fn) {
  var self = this;
  if (!items || items.length === 0) fn(null, null);
  var joinedItems = [];
  var equalArgLen = self._on.length === self._from.length 
    && self._from.length === self._as.length
    && self._as.length === self._to.length;
  if (!equalArgLen) {
    console.error('on length: %s, to length: %s, from length: %s, as length: %s', 
      self._on.length, self._to.length, self._from.length, self._as.length);
    throw new Error('join must have same number of .on(), .to(), .from(), and .as() arguments.');
  };
  var d = 0, doc;
  async.whilst(
    function() { return d < items.length },
    function(callback) {
      doc = items[d];

      var i = 0, on, to, from, as;
      async.whilst(
        function() { return i < self._on.length },
        function(innerCallback) {
          on = self._on[i];
          to = self._to[i];
          from = self._from[i];
          as = self._as[i];        
          i++;
          self.joinDoc(doc, on, to, from, as, function(err, joinedDoc) {
            if (joinedDoc) joinedItems.push(joinedDoc);
            innerCallback(err);
          });
        },
        function(err) {
          if (err) console.error('error: %s', err);
          d++;
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

Join.prototype.joinDoc = function joinDoc(doc, on, to, from, as, fn) {
  var self = this;
  var val = doc[on];
  if (!val) return fn(null, null); // no doc match, i.e. this doc doesn't have the 'on' field.
  // console.log('joining on "%s" == "%s" from "%s" as "%s"', to, val, from, as);   
  self._cursor.db.collection(from, function(err, collection) {
    if (err) return fn(err, null);
    var query = {};
    query[to] = val;
    collection.findOne(query, function(err, item) {
      if (err) return fn(err, null);
      doc[as] = item;
      return fn(null, doc);
    });
  });
}

Join.prototype.on = function on(fieldName) {
  this._on.push(fieldName);
  return this;
};

Join.prototype.to = function to(fieldName) {
  this._to.push(fieldName);
  return this;
};

Join.prototype.from = function from(collectionName) {
  this._from.push(collectionName);
  return this;
};

Join.prototype.as = function as(newFieldName) {
  this._as.push(newFieldName);
  return this;
};

Join.prototype.cursor = function cursor() {
  return this._cursor;
}

module.exports = Join;