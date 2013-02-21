var config = require('./config')
  , async = require('async')
  , should = require('should')
  , Join = require('../lib').Join
  , mongodb = require('mongodb')
  , Db = mongodb.Db
  , Server = mongodb.Server
  ;

describe('mongo-join', function() {
  describe('#join()', function() {
    it('Should join 1000 documents to a secondary collection', function(done) {
      
      // this.timeout(20000);

      var client
        , collection
        , subCollection
        , count = 1000
        , primaryColName = 'primary'
        , secondaryColName = 'secondary'
        ;
      // Construct 1000 documents and insert them into a collection that will be removed.
      async.waterfall([
        function openNewDbClient(callback) {
          var opts = {safe: true};
          client = new Db(config.dbname, new Server(config.host, config.port), opts);
          client.open(callback);
        }, function authenticate(client, callback) {
          should.exist(client);
          var doAuth = (config.username && config.password);
          doAuth
            ? client.authenticate(config.username, config.password, callback) 
            : callback(null, true);
        }, function collection(authed, callback) {
          authed.should.be.true;
          client.collection(primaryColName, callback);
        }, function removeAll(coll, callback) {
          should.exist(coll);
          collection = coll;
          collection.remove({}, callback);
        }, function subCollection(result, callback) {
          client.collection(secondaryColName, callback);
        }, function subRemoveAll(coll, callback) {
          should.exist(coll);
          subCollection = coll;
          subCollection.remove({}, callback);                   
        }, function ensureIndex(result, callback) {
          collection.ensureIndex({name: 1}, {w: 1, unique: true}, callback);             
        }, function insertDocs(index, callback) {
          var counter = 0;
          async.whilst(
            function() { return counter < count; },
            function(fn) {
              var secondaryDoc = {
                name: 'secondary' + counter,
                created: new Date()
              };
              subCollection.insert(secondaryDoc, {safe: true}, function(err, subDocs) {
                var primaryDoc = {
                  name: 'primary' + counter,
                  joindoc: subDocs[0]._id,
                  created: new Date()
                };
                collection.insert(primaryDoc, {safe: true}, function(err, pDoc) {
                  counter++;
                  fn(err);
                });
              });
            },
            function(err) {
              callback(err);
            }
          );
        }, function findCursor(callback) {
          collection.find({}, callback);
        }, function joinSubDocs(cursor, callback) {         
          var cursor = cursor.sort('name', 'ascending');
          var join = new Join(client).on({
            field: 'joindoc',
            to: '_id',
            from: secondaryColName
          });          
          join.toArray(cursor, callback);
        }, function showJoinedResults(items, callback) {
          console.log('\nJoined results (toArray) length: %s', items.length);
          console.dir(items.slice(0, 2));
          callback(null, true);
        }, function dropCollection(result, callback) {
          collection.drop(callback);
        }, function dropSubCollection(result, callback) {
          subCollection.drop(callback);          
        }, function closeDbClient(ignore, callback) {
          client.close();
          return done();
        }
      ], function(err) {
        // test will fail here automatically if there is an error
      });
    });  
  })
});