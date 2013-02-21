# mongo-join

__mongo-join__ provides document joins for MongoDB in Node.js. Based on the [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) module.

## Example

Let's say for example you have the following three collections:

- employees: contains a reference to an employer (by ObjectID) and contact (by email)
- employers: contains employer information
- contacts: contains the employees contact info, including email

You want to query the employees and get back their employer and contact info. You'd like the employer document to replace the ObjectID that represents it in the employee document. You'd like the contact document to be added as a separate field in the employee document. Here is an example of that:

```javascript

    // Query an employees collection, whose documents contain fields
    // referencing documents in the employer and contacts collections.
    var Join = require('mongo-join').Join
      , config = require('./config') // <- for example purposes
      , mongodb = require('mongodb')
      , Db = mongodb.Db
      , Server = mongodb.Server;

    var client = new Db(config.dbname, new Server(config.host, config.port));
    client.open(function(err, client) {
      client.collection('employees', function(err, employees) {
        employees.find({}, function(err, cursor) {
          var join = new Join(client).on({
            field: 'employer', // <- field in employee doc
            to: '_id',         // <- field in employer doc. treated as ObjectID automatically.
            from: 'employers'  // <- collection name for employer doc
          }).on({
            field: 'contactEmail', // <- field in employee doc
            as: 'contactInfo',     // <- new field in employee for contact doc
            to: 'email',           // <- field in contact doc
            from: 'contacts'       // <- collection name for contact doc
          });          
          join.toArray(cursor, function(err, joinedDocs) {
            // handle array of joined documents here
          });
        });
      });  
    });
```

## Streaming

In the example above, instead of ```join.toArray()``` we would do:

```javascript

    var stream = cursor.stream();
    join.stream(stream, 'data', function(joinedDoc) {
      // handle joined document here
    });
    join.stream(stream, 'close', function() {
      // handle stream closing here as usual
      // could also just call stream.on('close', function() {})
    });    
```

## API

### Constructor

A new Join is constructed on a mongodb client. E.g. ```var join = new Join(client);```

### on(opts)

Join instances are configured via the API method ```join.on(opts)```, which takes an opts object containing the following options describing how to join documents from secondary collections into the documents in the primary collection. The ```join.on(opts)``` method returns back the instance of the join so it can be chained. The opts object contains the following fields:

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

### findOne(collection, query, [opts], callback)

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

### nextObject(cursor, [opts], callback)

    /**
     * Performs join on calls to the specified cursor's nextObject() method.
     * @param  {Cursor}   cursor  Cursor for a collection query.
     * @param  {Object}   options (Optional) Options for nextObject().
     * @param  {Function} fn      Callback. Passed in (err, joinedDoc).
     * @return {None}
     */

### each(cursor, callback)

    /**
     * Performs join on calls to the specified cursor's each() method.
     * @param  {Cursor}   cursor Cursor for a collection query.
     * @param  {Function} fn     Callback takes the form (err, joinedDoc)
     * @return {None}
     */

### toArray(cursor, callback)

    /**
     * Performs a join on calls to the specified cursor's toArray() method.
     * @param  {Cursor}   cursor Cursor for a collection query.
     * @param  {Function} fn     Callback takes the form (err, joinedDocAry).
     * The second argument is an array of joined documents.
     * @return {None}
     */

### stream(stream, event, callback)

    /**
     * Performs a join on documents emitted from a cursor stream based
     * on a collection query.
     * @param  {CursorStream} _stream A stream opened via cursor.stream().
     * @param  {String}       event   If 'data' then the callback is passed
     * a joined document. Any other event is handled as usual.
     * @param  {Function}     fn      Callback of the form (joinedDoc).
     * @return {None}
     */