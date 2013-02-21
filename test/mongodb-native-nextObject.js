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
    it('Should join two documents into a third document based on keys in that third doc', function(done) {
      var client, collection, subCollection;
      // Construct 3 documents and insert them into a collection that will be removed.
      // There is a master document and 2 sub-documents referenced by the master doc in arbitrary fields.
      var master = {
        name: 'master-foo',
        created: new Date(),
        sub1: 'sub-bar', // there should be an index on the 'name' field of this referenced doc
        sub2: 'sub-baz'  // there should be an index on the 'name' field of this referenced doc
      };
      var otherMaster = {
        name: 'master-goo',
        created: new Date(),
        sub1: 'sub-bar', // there should be an index on the 'name' field of this referenced doc
      };      
      var subDoc1 = {
        name: 'sub-bar', // should have index
        amount: 10,
        created: new Date()
      };
      var subDoc2 = {
        name: 'sub-baz', // should have index
        amount: 42,
        description: 'answer to life, the universe, and everything',
        created: new Date()
      }; 
      var join;       
      async.waterfall([
        function openNewDbClient(callback) {
          var opts = {safe: true};
          client = new Db(config.dbname, new Server(config.host, config.port), opts);
          client.open(callback);
        }, function authenticate(client, callback) {
          should.exist(client);
          join = new Join(client).on({
            field: 'sub1',
            to: 'name',
            from: 'subord'
          }).on({
            field: 'sub2',
            as: 'sub2-doc',
            to: 'name',
            from: 'subord'
          });                   
          var doAuth = (config.username && config.password);
          doAuth
            ? client.authenticate(config.username, config.password, callback) 
            : callback(null, true);
        }, function collection(authed, callback) {
          authed.should.be.true;
          client.collection('master', callback);
        }, function removeAll(coll, callback) {
          should.exist(coll);
          collection = coll;
          collection.remove({}, callback);
        }, function subCollection(result, callback) {
          client.collection('subord', callback);
        }, function subRemoveAll(coll, callback) {
          should.exist(coll);
          subCollection = coll;
          subCollection.remove({}, callback);          
        }, function ensureIndex(result, callback) {
          subCollection.ensureIndex({name: 1}, {w: 1, unique: true}, callback);          
        }, function insertDocs(index, callback) {
          collection.insert(master, {w: 0});
          collection.insert(otherMaster, {w: 0});
          subCollection.insert(subDoc1, {w: 0});
          subCollection.insert(subDoc2, {w: 0});
          return callback(null, true);
        }, function findCursor(result, callback) {
          collection.find({}, callback);
        }, function joinSubDocs(cursor, callback) {         
          var cursor = cursor.sort('name', 'ascending');     
          callback(null, cursor);
        }, function nextObject1(cursor, callback) {
          join.nextObject(cursor, function(err, doc) {
            if (doc) {
              // console.log('\nJoined result (nextObject):');
              // console.dir(doc);
              callback(null, cursor);
            }
          });            
        }, function nextObject2(cursor, callback) {
          join.nextObject(cursor, function(err, doc) {
            if (doc) {
              // console.log('\nJoined result (nextObject):');
              // console.dir(doc);
              callback(null, null);
            }
          });                      
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