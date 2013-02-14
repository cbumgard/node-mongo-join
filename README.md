# mongo-join

__mongo-join__ provides document joins for MongoDB in Node.js. Based on the [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) module.

## API

A new Join is constructed on a mongodb cursor for a primary collection. Join instances have a single API method ```join.on(opts)```, which takes an opts object containing the following options describing how to join documents from secondary collections into the documents in the primary collection. The ```join.on(opts)``` method returns back the instance of the join so it can be chained. The opts object contains the following fields:

    @param field {String} (Required) Field name in the primary doc referencing secondary doc
    @param as    {String} (Optional) New field in the primary doc to store joined secondary doc. If omitted, secondary docs are stored in 'field'.
    @param to    {String} (Required) Field name in the secondary doc whose value is referenced by 'field' in the primary doc.
    @param from  {String} (Required) Collection for the secondary docs containing the 'to' field.

## Example

Let's say for example you have the following three collections:

- employees: contains a reference to an employer and contact
- employers: contains employer information
- contacts: contains the employees contact info

You want to query the employees and get back their employer and contact info. You'd like the employer document to replace the ObjectID that represents it in the employee document. You'd like the contact document to be added as a separate field in the employee document. Here is an example of that:

    var Join = require('mongo-join');

    // Initialize your db client connection and a collection
    // .....

    // Here we have a collection of employee documents.
    // We will join each employee doc to an employer doc 
    // based on the employer's ObjectID, and join each employee to
    // a contact info doc based on the contact's email address.
    // E.g. employee = {
    //   firstName: 'Chris', 
    //   lastName: 'Bumgardner',
    //   employer: ObjectId('...'),
    //   contactEmail: 'cbumgard@gmail.com'
    // }
    employeeCollection.find({}, function(err, cursor) {
      var join = new Join(cursor).on({
        field: 'employer', // <- field in employee doc
        to: '_id',         // <- field in employer doc
        from: 'employers'  // <- collection name for employer doc
      }).on({
        field: 'contactEmail', // <- field in employee doc
        as: 'contactInfo',     // <- new field in employee doc to hold joined contact doc
        to: 'email',           // <- field in contact doc
        from: 'contacts'       // <- collection name for contact doc
      });          
      join.cursor().toArray(callback);
    });
