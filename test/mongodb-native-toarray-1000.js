var config = require('./config')
  , async = require('async')
  , should = require('should')
  , Join = require('../lib').Join
  , testdata = require('./util/test-data.js')
  , util = require('util')
  ;

describe('mongo-join', function() {

  var client
    , collections       
    , count = 1000
    ;

  before(function(done) {

    this.timeout(10000);

    testdata.create(config, count, function(_client, _collections) {
      client = _client;
      collections = _collections;
      return done();
    });
  });

  after(function() {
    testdata.destroy(client, collections);
  });

  describe('#join()', function() {

    this.timeout(10000);

    it(util.format('Should join %s documents to a secondary collection', count), function(done) {

      var startTimeReg
        , endTimeReg
        , startTimeJoin
        , endTimeJoin
        ;

      // Construct documents and insert them into a collection that will be removed.
      async.waterfall([
        function findCursor(callback) {
          collections.primary.find({}, callback);
        }, function findNoJoin(cursor, callback) {
          var cursor = cursor.sort('name', 'ascending');
          startTimeReg = new Date().getTime();
          cursor.toArray(callback);
        }, function regularToArray(items, callback) {
          endTimeReg = new Date().getTime();
          console.log('***** Regular query time total for %s docs: %s ms', 
            items.length, (endTimeReg - startTimeReg));
          collections.primary.find({}, callback);
        }, function joinSubDocs(cursor, callback) {         
          var cursor = cursor.sort('name', 'ascending');
          var join = new Join(client).on({
            field: 'secondary',
            to: '_id',
            from: collections.secondary.collectionName
          }).on({
            field: 'tertiary',
            to: '_id',
            from: collections.tertiary.collectionName,
            as: 'tertiary_alias'
          });          
          startTimeJoin = new Date().getTime();
          join.toArray(cursor, callback);
        }, function showJoinedResults(items, callback) {
          endTimeJoin = new Date().getTime();
          // console.dir(items.slice(0, 1));
          console.log('***** Joined query time total for %s docs with 2 joins per doc: %s ms', 
            items.length, (endTimeJoin - startTimeJoin));
          return done();
        }
      ], function(err) {
        // test will fail here automatically if there is an error
      });
    });  
  })
});