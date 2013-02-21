var async = require('async')
  , should = require('should')
  , mongodb = require('mongodb')
  , Db = mongodb.Db
  , Server = mongodb.Server
  ;

exports.create = function create(config, count, fn) {
  var client
    , collections = {}
    ;
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
      client.collection('primary', callback);
    }, function removeAll(coll, callback) {
      should.exist(coll);
      collections.primary = coll;
      collections.primary.remove({}, callback);
    }, function secCollection(result, callback) {
      client.collection('secondary', callback);         
    }, function secRemoveAll(coll, callback) {
      should.exist(coll);
      collections.secondary = coll;
      collections.secondary.remove({}, callback);           
    }, function terCollection(result, callback) {
      client.collection('tertiary', callback);                   
    }, function terRemoveAll(coll, callback) {
      should.exist(coll);
      collections.tertiary = coll;
      collections.tertiary.remove({}, callback);                     
    }, function ensureIndex(result, callback) {
      collections.primary.ensureIndex({name: 1}, {w: 1, unique: true}, callback);             
    }, function insertDocs(index, callback) {
      var counter = 0;
      async.whilst(
        function() { return counter < count; },
        function(fn) {
          var secondaryDoc = {
            name: 'secondary' + counter,
            created: new Date()
          };
          collections.secondary.insert(secondaryDoc, {safe: true}, function(err, secDocs) {
            var tertiaryDoc = {
              name: 'tertiary' + counter,
              created: new Date()
            };
            collections.tertiary.insert(tertiaryDoc, {safe: true}, function(err, terDocs) {
              var primaryDoc = {
                name: 'primary' + counter,
                secondary: secDocs[0]._id,
                tertiary: terDocs[0]._id,
                created: new Date()
              };
              collections.primary.insert(primaryDoc, {safe: true}, function(err, pDoc) {
                counter++;
                fn(err);
              });
            });
          });
        },
        function(err) {
          return fn(client, collections);
        }
      );
    }
  ], function(err) {
    // test will fail here automatically if there is an error
  });  
}

exports.destroy = function destroy(client, collections) {
  async.waterfall([
    function dropCollection(callback) {
      collections.primary.drop(callback);
    }, function dropSecCollection(result, callback) {
      collections.secondary.drop(callback);          
    }, function dropTerCollection(result, callback) {
      collections.tertiary.drop(callback);                    
    }, function closeDbClient(ignore, callback) {
      client.close();
      return callback(null);
    }
  ], function(err) {
    // test will fail here automatically if there is an error
  });  
}