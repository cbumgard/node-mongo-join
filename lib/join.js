var async = require('async')
  , mongodb = require('mongodb')
  , Collection = mongodb.Collection;

/**
 * Join
 *
 * Joins documents from other collections into documents
 * accessed from a Cursor.
 * Joins are specified by calling the .on(opts) method.
 * To perform the join(s), invoke the appropriate method.
 * E.g. join.toArray(), join.each(), join.nextObject(), join.findOne(),
 * or join.stream() for streaming joins.
 *
 * @param {Cursor} cursor MongoDB native drive cursor from a collection query.
 */
var Join = function Join(client) {
  var self = this;

  this.client = client;

  /**
   * Array of join 'on' objects. These objects specify how to
   * join documents from other collections into documents
   * from this collection's cursor.
   * @api private
   * @type {Array}
   */
  var _on = [];

  /**
   * Add a new join on another collection.
   * @api privileged
   * @param  {Object} opts Must contain fields 'field', 'to', and 'from', and
   * optionally 'as'. 'field' specifies the field name in this cursor's doc
   * that references a foreign collection's doc we want to join. 'to' 
   * represents the field name in the foreign collection's doc, and 'from'
   * represents the name of the foreign collection. optionally 'as' specifies
   * a new or existing field in this collection's doc that will hold the
   * joined doc from the foreign collection. If 'as' is omitted, the joined
   * doc by default will be stored in the 'field' field.
   * @return {Join}   This instance. Can be used to chain .on() method calls.
   */
  this.on = function on(opts) {
    var isValid = opts 
      && opts.hasOwnProperty('field')
      && opts.hasOwnProperty('to')
      && opts.hasOwnProperty('from');
    if (!isValid) throw new Error('requires object param containing "field", "to", and "from"');
    // If no field specified to store the joined document, store in the original
    // field that contained the reference to the other document:
    if (!opts.hasOwnProperty('as')) opts.as = opts.field;
    _on.push(opts);
    return this;
  };

  /**
   * Get the reference to the array of join 'on' objects.
   * @api public
   * @return {Array} Array of join 'on' objects describing one
   * or more collections to join into this one.
   */
  this.joins = function joins() {
    return _on;
  }

  /**
   * Iterate over an array of documents from this collection,
   * and for each document perform an in-place join from one
   * or more foreign collections.
   * @api public
   * @param  {Array}    items Documents in this collection to populate via joins.
   * @param  {Function} fn    Callback function. Passed err as first arg.
   * @return {None}
   */
  this.doJoinArray = function doJoinArray(items, fn) {
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

  /**
   * For one document in this collection, perform an in-place join 
   * from one or more foreign collections.
   * @api public
   * @param  {Object}   doc   Document in this collection to populate via joins.
   * @param  {Function} fn    Callback function. Passed err as first arg.
   * @return {None}
   */
  this.doJoinScalar = function doJoinScalar(doc, fn) {
    var self = this;
    if (!doc) fn(null, null);
    var counter = 0;
    var joins = self.joins();
    async.whilst(
      function() { 
        return counter < joins.length 
      },
      function(callback) {
        self.joinDoc(doc, joins[counter], function(err) {
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

  /**
   * Join a single document from a foreign collection into a field
   * in the specified document from this collection.
   * @api public
   * @param  {Object}   doc  Document from this cursor's collection
   * that will contain the joined document.
   * @param  {Object}   join Object containing join 'on' criteria.
   * @param  {Function} fn   Callback when join is finished. Passed 
   * err as first argument.
   * @return {None}
   */
  this.joinDoc = function joinDoc(doc, join, fn) {
    var self = this;
    if (!doc) {
      return fn(null, null);
    }  
    var val = doc[join.field];
    if (!val) return fn(null, null); // no doc match, i.e. this doc doesn't have the 'on' field.
    self.client.collection(join.from, function(err, collection) {
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
};

var clone = function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

Join.prototype.findOne = function findOne() {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var collection = args.shift();
  var fn = args.pop();  
  var proxyFindOneFn = function proxyFindOneFn(err, doc) {
    self.doJoinScalar(clone(doc), fn);
  };  
  args.push(proxyFindOneFn); // replace previous callback w proxied callback
  Collection.prototype.findOne.apply(collection, args);
};

Join.prototype.nextObject = function nextObject(cursor, options, fn) {
  var self = this;
  if (typeof options == 'function') {
    fn = options;
    options = {};
  }  
  var proxyNextObjFn = function proxyNextObjFn(err, doc) {
    self.doJoinScalar(clone(doc), fn);
  };
  cursor.nextObject(options, proxyNextObjFn);  
};

Join.prototype.each = function each(cursor, fn) {
  var self = this;
  var proxyEachFn = function proxyEachFn(err, doc) {
    self.doJoinScalar(clone(doc), fn);
  };
  cursor.each(proxyEachFn);
};

Join.prototype.toArray = function each(cursor, fn) {
  var self = this;
  var proxyAryFn = function proxyAryFn(err, items) {
    self.doJoinArray(clone(items), fn);
  };
  cursor.toArray(proxyAryFn);
};

Join.prototype.stream = function stream(_stream, event, fn) {
  var self = this;
  var streamFn;
  var proxyStreamFn = function proxyStreamFn(doc) {
    // Respect the sort order by waiting for join queries to
    // complete before processing the next object in the stream.
    // Otherwise documents can be emitted out of order.
    _stream.pause(); 
    self.doJoinScalar(clone(doc), function(err, joindoc) {
      fn(joindoc);
      _stream.resume();
    });
  };
  streamFn = (event === 'data') ? proxyStreamFn : fn;
  _stream.on(event, streamFn);
};

// Exported interface:
module.exports = Join;