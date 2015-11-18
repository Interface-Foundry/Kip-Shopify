var express = require('express')
var app = module.exports = express();
var mongoose = require('mongoose')
var ObjectId = mongoose.Types.ObjectId
var nodify = require('nodify-shopify');
var apiKey, secret;
var persistentKeys = {};
var db = require('../IF-root/components/IF_schemas/db')
var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var uniquer = require('../IF-root/IF_services/uniquer');
var tagParser = require('../IF-root/IF_services/IF_forage/tagParser');
var upload = require('../IF-root/IF_services/upload')
var config = require('./config.json');
var request = require('request')
apiKey = config.apiKey;
secret = config.secret;

async.whilst(
    function() {
        return true
    },
    function(dailyUpdate) {
        console.log('Updating Shopify Inventory')
        old_items = [];
        new_items = [];

        db.Credentials.find({
            'vendor': 'shopify'
        }, function(err, accounts) {
            async.eachSeries(accounts, function iterator(account, finishedAccount) {
                // console.log('!!!','shopify_' + account.name.toString())
                db.Landmarks.findOne({
                    'id': 'shopify_' + account.name.toString(),
                    'world': true
                }, function(err, shop) {
                    if (err) console.log('31: ', err)
                    if (!shop) {
                        console.log('33: Shop Not found!')
                        return finishedAccount()
                    }
                    console.log('Shop found: ', shop._id)
                    // var sid = new ObjectId(shop._id);
                    db.Landmarks.find({
                        'parents': shop._id
                    }, function(err, olditems) {
                        if (err) console.log('31: ', err)
                        if (!olditems || (olditems && olditems.length < 1)) {
                            console.log('46: No items found for this shop!')
                            return finishedAccount()
                        }
                        console.log('Found ', olditems.length, ' existing item(s).')
                        old_items = olditems.map(function(item) {
                            return 'shopify_' + item.id.toString().trim()
                        })

                        var url = 'https://' + account.shop.trim() + '/admin/products.json?scope=read_products'
                        var options = {
                            url: url,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13',
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': account.token
                            }
                        };
                        // console.log('GET URL: ', url)
                        request(options, function(error, response, body) {
                            if ((!error) && (response.statusCode == 200)) {
                                body = JSON.parse(body);
                                if (!body.products || body.products.length < 1) {
                                    console.log('\n\n\nEmpty response...\n\n\n')
                                    return finishedAccount();
                                }
                                async.eachSeries(body.products, function iterator(product, finishedProduct) {
                                    if (product.variants && product.variants.length < 1) {
                                        return finishedProduct()
                                    }
                                    new_items = product.variants.map(function(variant) {
                                        return 'shopify_' + variant.id.toString().trim()
                                    })
                                    removeDeprecatedItemsFromDb(old_items, new_items).then(function() {

                                            async.eachSeries(product.variants, function iterator(variant, finishedVariant) {
                                                db.Landmark.findOne({
                                                        'id': 'shopify_' + variant.id.toString().trim(),
                                                        'linkbackname': 'myshopify.com'
                                                    }, function(err, item) {
                                                        if (err) console.log('58: ', err);
                                                        if (!item) {
                                                            console.log('This is a new item, adding it to db...')
                                                            getImages(product).then(function(awsImages) {
                                                                //Create new item for each store in inventory list.
                                                                var i = new db.Landmark();
                                                                i.itemImageURL = awsImages;
                                                                //Lets put online-only stuff in the south-pole, will have to modify search to include south-pole results universally
                                                                i.loc.type = 'MultiPoint';
                                                                i.loc.coordinates = shop ? [shop.loc.coordinates] : [
                                                                    [0, -90]
                                                                ];
                                                                i.source_generic_item = {
                                                                    product_name: product.title,
                                                                    product_description: product.body_html,
                                                                    shop: data.shop.replace(/[^\w\s]/gi, ' ').split(' ').join(' '),
                                                                    inventory_tracked: (variant.inventory_management == 'shopify' && variant.inventory_policy == 'continue') ? true : false,
                                                                    inventory_quantity: (variant.inventory_management == 'shopify' && variant.inventory_policy == 'continue' && variant.inventory_quantity && variant.inventory_quantity > 0) ? variant.inventory_quantity : undefined
                                                                }
                                                                i.parents = shop ? [shop._id] : [];
                                                                i.world = false;
                                                                i.price = parseFloat(variant.price);
                                                                if (variant.title !== 'Default Title') {
                                                                    i.name = variant.title.replace(/[^\w\s]/gi, '');
                                                                } else {
                                                                    i.name = product.title
                                                                }
                                                                i.linkback = data.homelink;
                                                                i.linkbackname = 'myshopify.com';
                                                                var tags = i.name.split(' ').map(function(word) {
                                                                    return word.toString().toLowerCase()
                                                                });
                                                                tags = tags.concat(productTags);
                                                                tags = tags.concat(data.shop.replace(/[^\w\s]/gi, ' ').split(' '));
                                                                tags.forEach(function(tag) {
                                                                    i.itemTags.text.push(tag)
                                                                });
                                                                try {
                                                                    i.itemTags.text = tagParser.parse(i.itemTags.text)
                                                                } catch (err) {
                                                                    console.log('tagParser error: ', err)
                                                                }
                                                                i.hasloc = true;
                                                                if (!i.name) {
                                                                    i.name = 'Shopify Item'
                                                                }
                                                                i.id = 'shopify_' + variant.id.toString().trim();
                                                                i.save(function(e, item) {
                                                                    if (e) {
                                                                        console.log('452: ', e);
                                                                    } else {
                                                                        console.log('Shopify item saved to db: ', item.name)
                                                                    }
                                                                    return finishedVariant()
                                                                })
                                                            })
                                                        } else if (item) {
                                                            console.log(item.name, ' exists.. updating its inventory...')
                                                                //CASE 1 : Store does not allow back orders, and inventory quantity is 0.
                                                            if (variant.inventory_policy == 'deny' && variant.inventory_quantity == 0) {
                                                                console.log('\nCase 1: Store does not allow back orders, and inventory quantity is 0.')
                                                                item.update({
                                                                        $set: {
                                                                            'parents': [],
                                                                            'loc.coordinates': [
                                                                                [0, 90]
                                                                            ],
                                                                            'source_generic_item.inventory_quantity': 0
                                                                        }
                                                                    }, function(e, result) {
                                                                        if (e) {
                                                                            console.log('66: ', e)
                                                                        }
                                                                        finishedVariant();
                                                                    })
                                                                    //CASE 2: Inventory quantity is greater than 0
                                                            } else if (variant.inventory_quantity > 0) {
                                                                console.log('\nCase 2: Inventory quantity is greater than 0')
                                                                item.update({
                                                                        $set: {
                                                                            'source_generic_item.inventory_quantity': variant.inventory_quantity
                                                                        }
                                                                    }, function(e, result) {
                                                                        if (e) {
                                                                            console.log('66: ', e)
                                                                        }
                                                                        console.log('Result: ', result.ok, result.n)
                                                                        finishedVariant();
                                                                    })
                                                                    //CASE 3: Back-orders allowed just update the inventory
                                                            } else if (variant.inventory_policy == 'continue') {
                                                                console.log('\nCase 3: Back-orders allowed just update the inventory quantity for the hell of it')
                                                                item.update({
                                                                    $set: {
                                                                        'source_generic_item.inventory_quantity': variant.inventory_quantity
                                                                    }
                                                                }, function(e, result) {
                                                                    if (e) {
                                                                        console.log('66: ', e)
                                                                    }
                                                                    finishedVariant();
                                                                })
                                                            } else {
                                                                console.log('\nCase 4: wtfcakes')
                                                                console.log('655 WTF should not his this case: ', JSON.stringify(variant))
                                                                finishedVariant();
                                                            }
                                                        }
                                                    }) //end of db.landmark.findone
                                            }, function finishedVariants(err) {
                                                if (err) console.log('116: ', err)
                                                    // console.log('Finished Variants!')
                                                finishedProduct()
                                            })
                                        }) //end of removedeprecateditems
                                }, function finishedProducts(err) {
                                    if (err) console.log('595: ', err);
                                    console.log('\n...Shop updated!')
                                    wait(function() {
                                        finishedAccount();
                                    }, 800);
                                })
                            } else {
                                if (error) {
                                    console.log('Shopify API error ', error)
                                    wait(function() {
                                        finishedAccount();
                                    }, 800);
                                } else {
                                    console.log('bad response', body)
                                    wait(function() {
                                        finishedAccount();
                                    }, 800);
                                }
                            }
                        });
                    })
                })
            }, function finishedAccounts(err) {
                if (err) console.log('154: ', err)
                console.log('Finished Updating Accounts.')
                wait(dailyUpdate, 86399999); // Update Daily
            })
        })
    },
    function(err) {
        if (err) console.log('164: ', err)
    }
);

function removeDeprecatedItemsFromDb(old_items, new_items) {
    return new Promise(function(resolve, reject) {
        var d = _.difference(old_items, new_items);
        if (d.length < 1) {
            return resolve('No items to remove.')
        }
        db.Landmarks.remove({
            'id': {
                $in: d
            },
            'linkbackname': 'myshopify.com',
            'world': false
        }, function(err, result) {
            if (err) {
                console.log(err)
                return reject()
            } else {
                console.log('Updated inventory: ', result.result.ok, result.result.n)
                resolve()
            }
        })
    })
}

function wait(callback, delay) {
    var startTime = new Date().getTime();
    while (new Date().getTime() < startTime + delay);
    callback();
}