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
          var join = new Join(cursor).on({
            field: 'employer', // <- field in employee doc
            to: '_id',         // <- field in employer doc
            from: 'employers'  // <- collection name for employer doc
          }).on({
            field: 'contactEmail', // <- field in employee doc
            as: 'contactInfo',     // <- new field in employee for contact doc
            to: 'email',           // <- field in contact doc
            from: 'contacts'       // <- collection name for contact doc
          });          
          cursor.toArray(callback);
        });
      });  
    });
```

## Streaming

Same as above, just replace `new Join(cursor)` with `new JoinStream(cursor)` and be sure to `JoinStream = require('mongo-join').JoinStream`. Then simply go about streaming as usual, e.g. `var stream = cursor.stream(); stream.on('data', ...)` etc.

## API

A new Join is constructed on a mongodb cursor for a primary collection. Join instances have a single API method ```join.on(opts)```, which takes an opts object containing the following options describing how to join documents from secondary collections into the documents in the primary collection. The ```join.on(opts)``` method returns back the instance of the join so it can be chained. The opts object contains the following fields:

    @param field {String} (Required) Field name in the primary doc referencing 
                                     secondary doc
    @param as    {String} (Optional) New field in the primary doc to store 
                                     joined secondary doc. If omitted, 
                                     secondary docs are stored in 'field'.
    @param to    {String} (Required) Field name in the secondary doc whose 
                                     value is referenced by 'field' in the 
                                     primary doc.
    @param from  {String} (Required) Collection for the secondary docs 
                                     containing the 'to' field.
