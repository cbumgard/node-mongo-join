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
      
      this.timeout(10000);

      var client
        , collection
        , secCollection
        , terCollection
        , count = 1000
        , primaryColName = 'primary'
        , secondaryColName = 'secondary'
        , tertiaryColName = 'tertiary'        
        , startTimeReg
        , endTimeReg
        , startTimeJoin
        , endTimeJoin
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
        }, function secCollection(result, callback) {
          client.collection(secondaryColName, callback);         
        }, function secRemoveAll(coll, callback) {
          should.exist(coll);
          secCollection = coll;
          secCollection.remove({}, callback);           
        }, function terCollection(result, callback) {
          client.collection(tertiaryColName, callback);                   
        }, function terRemoveAll(coll, callback) {
          should.exist(coll);
          terCollection = coll;
          terCollection.remove({}, callback);                     
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
              secCollection.insert(secondaryDoc, {safe: true}, function(err, secDocs) {
                var tertiaryDoc = {
                  name: 'tertiary' + counter,
                  created: new Date()
                };
                terCollection.insert(tertiaryDoc, {safe: true}, function(err, terDocs) {
                  var primaryDoc = {
                    name: 'primary' + counter,
                    secondary: secDocs[0]._id,
                    tertiary: terDocs[0]._id,
                    created: new Date()
                  };
                  collection.insert(primaryDoc, {safe: true}, function(err, pDoc) {
                    counter++;
                    fn(err);
                  });
                });
              });
            },
            function(err) {
              callback(err);
            }
          );
        }, function findCursor(callback) {
          collection.find({}, callback);
        }, function findNoJoin(cursor, callback) {
          var cursor = cursor.sort('name', 'ascending');
          startTimeReg = new Date().getTime();
          cursor.toArray(callback);
        }, function regularToArray(items, callback) {
          endTimeReg = new Date().getTime();
          console.log('***** Regular query time total for %s docs: %s ms', 
            items.length, (endTimeReg - startTimeReg));
          collection.find({}, callback);
        }, function joinSubDocs(cursor, callback) {         
          var cursor = cursor.sort('name', 'ascending');
          var join = new Join(client).on({
            field: 'secondary',
            to: '_id',
            from: secondaryColName
          }).on({
            field: 'tertiary',
            to: '_id',
            from: tertiaryColName,
            as: 'tertiary_alias'
          });          
          startTimeJoin = new Date().getTime();
          join.toArray(cursor, callback);
        }, function showJoinedResults(items, callback) {
          endTimeJoin = new Date().getTime();
          console.dir(items.slice(0, 1));
          console.log('***** Joined query time total for %s docs: %s ms', 
            items.length, (endTimeJoin - startTimeJoin));
          callback(null, true);
        }, function dropCollection(result, callback) {
          collection.drop(callback);
        }, function dropSecCollection(result, callback) {
          secCollection.drop(callback);          
        }, function dropTerCollection(result, callback) {
          terCollection.drop(callback);                    
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