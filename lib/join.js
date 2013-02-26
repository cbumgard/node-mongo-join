"use strict"

var async = require('async')
  , semaphore = require('semaphore')(1)
  , mongodb = require('mongodb')
  , Collection = mongodb.Collection
  , ObjectID = require('mongodb').ObjectID
  , Stream = require('stream').Stream
  ;

/**
 * Join
 *
 * Joins documents from other collections into documents
 * accessed from a MongoDB Cursor.
 * 
 * Joins are specified by calling the .on(opts) method.
 * To perform the join(s), invoke the appropriate method
 * on an instance of Join.
 * 
 * E.g. join.toArray(), join.each(), join.nextObject(), or join.findOne().
 * You can also call join.stream() for streaming joins.
 *
 * @param {Db} Opened MongoDB native driver DB client.
 */
var Join = function Join(client) {
  var self = this;

  /**
   * Keep a reference to the open db client.
   * Needed when joining docs internally from other collections.
   * @type {Db}
   */
  this.client = client;

  /**
   * Array of join 'on' objects. These objects specify how to
   * join documents from other collections into documents
   * from this collection's cursor.
   * @type {Array}
   */
  var _on = [];

  /**
   * Add a new join on another collection.
   * @param  {Object} opts Must contain fields 'field', 'to', and 'from', and
   * optionally 'as'. 
   * 'field' specifies the field name in this cursor's doc
   * that references a foreign collection's doc we want to join. 
   * 'to' represents the field name in the foreign collection's doc
   * 'from' represents the name of the foreign collection. 
   * 'as' optionally specifies a new or existing field in this 
   * collection's doc that will hold the
   * joined doc from the foreign collection. If 'as' is omitted, the joined
   * doc by default will be stored in the 'field' field.
   * 'id' optionally specifies (true or false) whether the 'to' field should be
   * treated as a MongoDB ObjectID. By default true if 'to' is the field '_id'
   * and false otherwise.
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
    if (!opts.hasOwnProperty('id')) opts.id = (opts.to === '_id');
    _on.push(opts);
    return this;
  };

  /**
   * Get the reference to the array of join 'on' objects.
   * @return {Array} Array of join 'on' objects describing one
   * or more collections to join into this one.
   */
  this.joins = function joins() {
    return _on;
  }

  /**
   * Iterate over an array of documents from this collection,
   * and for each document perform an in-place join from one
   * or more foreign collections. Sends the joined results back
   * as an array to the callback. The joined result array is based
   * on a clone of the original array so that we do not mutate
   * the docs referenced by the cursor.
   * @param  {Array}    items Documents in this collection to populate via joins.
   * @param  {Function} fn    Callback function. Passed err as first arg.
   *                          Passed array of joined docs as second arg.
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
   * from one or more foreign collections. The joined result doc is based
   * on a clone of the original doc so that we do not mutate
   * the doc referenced by the cursor.
   * @param  {Object}   doc   Document in this collection to populate via joins.
   * @param  {Function} fn    Callback function. Passed err as first arg.
   *                          Passed join doc as second arg.
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
   * @param  {Object}   doc  Document from this cursor's collection
   * that will contain the joined document. Calling methods should
   * pass in a clone of the cursor's doc so we do not mutate it.
   * @param  {Object}   join Object containing join 'on' criteria.
   * @param  {Function} fn   Callback when join is finished. Passed 
   * err as first argument. Passed joined doc as second arg.
   * @return {None}
   */
  this.joinDoc = function joinDoc(doc, join, fn) {
    var self = this;
    if (!doc) {
      return fn(null, null);
    }  
    var val = join.id ? new ObjectID(doc[join.field]) : doc[join.field];
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

/**
 * Clone a JavaScript object.
 * @param  {Object} obj Original
 * @return {Object}     Clone
 */
var clone = function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Performs join on calls to the specified collection's each() method.
 * Like the Collection.each() method, this method takes a variable
 * length of arguments. The first must be a Collection in this case, 
 * and the second must be a query object to find a single document,
 * and the last must be a callback function that expects the 
 * form (err, joinedDoc).
 * @param {Collection} collection Collection used to perform the findOne().
 * @param {Object}     query      Query to find one document.
 * @param {Object}     opts       (Optional) Options to the query.
 * @param {Function}   callback   Callback after document is found and joined.
 * Takes form (err, joinedDoc).
 * @return {None}
 */
Join.prototype.findOne = function findOne() {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var collection = args.shift();
  var fn = args.pop();  
  var proxyFindOneFn = function proxyFindOneFn(err, doc) {
    if (err || !doc) return fn(err, doc);
    self.doJoinScalar(clone(doc), fn);
  };  
  args.push(proxyFindOneFn); // replace previous callback w proxied callback
  Collection.prototype.findOne.apply(collection, args);
};

/**
 * Performs join on calls to the specified cursor's nextObject() method.
 * @param  {Cursor}   cursor  Cursor for a collection query.
 * @param  {Object}   options (Optional) Options for nextObject().
 * @param  {Function} fn      Callback. Passed in (err, joinedDoc).
 * @return {None}
 */
Join.prototype.nextObject = function nextObject(cursor, options, fn) {
  var self = this;
  if (typeof options == 'function') {
    fn = options;
    options = {};
  }  
  var proxyNextObjFn = function proxyNextObjFn(err, doc) {
    if (err || !doc) return fn(err, doc);
    self.doJoinScalar(clone(doc), fn);
  };
  cursor.nextObject(options, proxyNextObjFn);  
};

/**
 * Performs join on calls to the specified cursor's each() method.
 * @param  {Cursor}   cursor Cursor for a collection query.
 * @param  {Function} fn     Callback takes the form (err, joinedDoc)
 * @return {None}
 */
Join.prototype.each = function each(cursor, fn) {
  var self = this;
  // Uses a semaphore to control the sort order by limiting the
  // underlying cursor's each() method from continuing to the next
  // iteration until the current document has finished it's join queries.
  var proxyEachFn = function proxyEachFn(err, doc) {
    // Don't take a semaphore and try to join on the null doc at the end:
    if (err || !doc) return fn(err, doc);
    semaphore.take(function() {
      self.doJoinScalar(clone(doc), function(err, joindoc) {
        semaphore.leave();
        fn(err, joindoc);
      });
    });    
  };
  cursor.each(proxyEachFn);
};

/**
 * Performs a join on calls to the specified cursor's toArray() method.
 * @param  {Cursor}   cursor Cursor for a collection query.
 * @param  {Function} fn     Callback takes the form (err, joinedDocAry).
 * The second argument is an array of joined documents.
 * @return {None}
 */
Join.prototype.toArray = function each(cursor, fn) {
  var self = this;
  var proxyAryFn = function proxyAryFn(err, items) {
    if (err) return fn(err, items);
    if (items && items.length === 0) return fn(err, items);
    self.doJoinArray(clone(items), fn);
  };
  cursor.toArray(proxyAryFn);
};

/**
 * Modifies a MongoDB native cursor stream so that documents from 
 * emitted 'data' type events will be joined based on the join criteria
 * for this instance.
 * @param  {Cursor} cursor Cursor for a collection query that will be streamed.
 * @return {CursorStream} A CursorStream whose .on() method is proxied
 * so that 'data' type events are captured and the emitted document
 * is joined before resuming the stream.
 */
Join.prototype.stream = function stream(cursor) {
  var self = this;
  var _stream = cursor.stream();
  _stream.on = function(type, listener) {
    var proxyStreamFn = function proxyStreamFn(doc) {
      // Respect the sort order by waiting for join queries to
      // complete before processing the next object in the stream.
      // Otherwise documents can be emitted out of order.
      _stream.pause(); 
      self.doJoinScalar(clone(doc), function(err, joindoc) {
        _stream.resume();      
        listener(joindoc);
      });
    };
    var streamFn = (type === 'data') ? proxyStreamFn : listener;
    Stream.prototype.on.call(_stream, type, streamFn);
  };
  return _stream;
};

// Exported interface:
module.exports = Join;