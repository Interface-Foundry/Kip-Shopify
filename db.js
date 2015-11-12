var Promise = require("bluebird");
var mongoose = Promise.promisifyAll(require('mongoose'));
// var config = require('config');

if (mongoose.connection.readyState == 0) {
    mongoose.connect('mongodb://pikachu.kipapp.co:27017/foundry', {
        replset: {
            rs_name: 'foundry',
            socketOptions: {
                keepAlive: 1
            }
        }
    });
    var db_conn = mongoose.connection;
    db_conn.on('error', function(err) {
        console.log('Mongo Connection Error: ', err)
    });
    db_conn.on('open', function() {
        console.log('connected to mongodb://flareon.internal.kipapp.co/foundry,jankeon.internal.kipapp.co/foundry,vaporeon.internal.kipapp.co/foundry?&connectTimeoutMS=600000&socketTimeoutMS=600000');
    });
}

/**
 * This file lets us do things like:
 * db.Users.find({})
 * var user = new db.User()
 */

/**
 * Schema definition
 * @type {{filename: string, single: string, plural: string}[]}
 */
var schemas = [{
    filename: 'landmark_schema',
    single: 'Landmark',
    plural: 'Landmarks'
}, {
    filename: 'shopifyAccounts_schema',
    single: 'ShopifyAccount',
    plural: 'ShopifyAccounts'
}];

// module.exports = mongoose.model('shopifyAccounts', shopifyAccountsSchema, 'shopifyAccounts');

module.exports = {
    connection: mongoose.connection,
    collection: mongoose.collection
};

/**
 * Expose all the single and plural versions
 */
schemas.map(function(schema) {
    var model = require('./' + schema.filename);
    module.exports[schema.single] = model;
    module.exports[schema.plural] = model;
});


/**
 * Expose a function called "map" which iterates over each collection.
 */
module.exports.map = function(cb) {
    schemas.map(function(schema) {
        return module.exports[schema.single];
    }).map(cb);
};