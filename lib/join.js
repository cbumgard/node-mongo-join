var async = require('async');

/**
 * Join
 *
 * Returns a wrapper on a mongodb Cursor that joins documents
 * from other collections when documents are read from the cursor.
 * Joins are specified by calling the .on(opts) method.
 * After that the cursor can be used in the normal manner,
 * for example calling its .toArray() method.
 *
 * For streaming joins, please see JoinStream in this same library.
 * 
 * @param {Cursor} cursor MongoDB native drive cursor from a collection query.
 */
var Join = function Join(cursor) {
  var self = this;

  /**
   * Original query cursor. Results from nextObject() will be joined
   * to documents from other collections.
   * @api private
   * @type {Cursor}
   */
  var _cursor = cursor;  

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
   * Get the reference to this collection's cursor.
   * @api privileged
   * @return {Cursor} This collection's cursor enhanced for joins.
   */
  this.cursor = function cursor() {
    return _cursor;
  }

  // Create a proxy around the cursor's nextObject() method
  // so that we can decorate it to do a join query every time
  // new documents are read from the cursor. The documents
  // are updated in-place so any consumer of this cursor
  // will get the fully joined document.
  self.proxyNextObject(cursor);
};

/**
 * Creates a proxy on the cursor's nextObject() method so that
 * we can execute an in-place join via a separate query to another
 * collection and update the original doc(s) in this cursor.
 * @api public
 * @param  {Cursor} cursor Cursor for this collection.
 * @return {None}
 */
Join.prototype.proxyNextObject = function proxyNextObject(cursor) {
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

/**
 * Specifies how to implement the join. In this instance it does 
 * a join on each item in the cursor's array of items. See JoinStream
 * in this library to see an overridden version that works on scalars.
 * @api public
 * @param  {Cursor}   cursor    Cursor for this collection.
 * @param  {Object}   doc       Next doc in the cursor (ignored in this implementation)
 * @param  {Function} _callback Original callback for nextObject() that gets decorated
 * @param  {Function} proxy     Proxy to the cursor's nextObject() method
 * @return {None}               Modifies the doc in place (side-effect)
 */
Join.prototype.joinFn = function joinFn(cursor, doc, _callback, proxy) {
  //TODO: do this without side-effect of mutating original doc?
  this.doJoinArray(cursor.items, function(err, doc) {
    _callback.call(proxy, err, doc); //TODO handle err?
  });  
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
Join.prototype.doJoinArray = function doJoinArray(items, fn) {
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
Join.prototype.doJoinScalar = function doJoinScalar(doc, fn) {
  var self = this;
  if (!doc) fn(null, null);
  var counter = 0;
  var joins = self.joins();
  async.whilst(
    function() { return counter < joins.length },
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
Join.prototype.joinDoc = function joinDoc(doc, join, fn) {
  var self = this;
  if (!doc) {
    return fn(null, null);
  }  
  var val = doc[join.field];
  if (!val) return fn(null, null); // no doc match, i.e. this doc doesn't have the 'on' field.
  self.cursor().db.collection(join.from, function(err, collection) {
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

// Exported interface:
module.exports = Join;