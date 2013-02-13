var config = require('./config')
  , async = require('async')
  , should = require('should')
  , Join = require('../lib/mongo-join')
  , mongodb = require('mongodb')
  , Db = mongodb.Db
  , Cursor = mongodb.Cursor
  , Collection = mongodb.Collection
  , Server = mongodb.Server
  ;

describe('mongo-join', function() {
  describe('#join()', function() {
    it('Should join two documents into a third document based on keys in that third doc', function(done) {
      var client, collection;
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
      console.log('Original docs:');
      console.dir([master, otherMaster, subDoc1, subDoc2]);
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
          client.collection('jointest', callback);
        }, function removeAll(coll, callback) {
          should.exist(coll);
          collection = coll;
          collection.remove({}, callback);
        }, function insertDocs(result, callback) {
          collection.insert(master, {w: 0});
          collection.insert(otherMaster, {w: 0});
          collection.insert(subDoc1, {w: 0});
          collection.insert(subDoc2, {w: 0});
          return callback(null, true);
        }, function findCursor(result, callback) {
          // collection.find({name: 'master-foo'}, callback);
          collection.find({}, callback);
        }, function joinSubDocs(cursor, callback) {         
          var join = new Join(cursor);
          join.on('sub1').to('name').from('jointest').as('sub1');
          join.on('sub2').to('name').from('jointest').as('sub2');
          join.cursor().toArray(callback);
        }, function showJoinedResults(doc, callback) {
          console.log('Joined results:');
          console.dir(doc);
          callback(null, true);
        }, function dropCollection(result, callback) {
          collection.drop(callback);
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