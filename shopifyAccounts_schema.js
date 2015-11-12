var mongoose = require('mongoose');

//schema construction
var Schema = mongoose.Schema,
    ObjectID = Schema.ObjectID;

var shopifyAccountsSchema = new Schema({
    name: String,
    shop: String,
    client_id: String,
    client_secret: String,
    token: String
});


module.exports = mongoose.model('shopifyAccounts', shopifyAccountsSchema, 'shopifyAccounts');