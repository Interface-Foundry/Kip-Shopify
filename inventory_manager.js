var express = require('express'),
    routes = require('./routes')

var app = module.exports = express.createServer();
var nodify = require('nodify-shopify');
var apiKey, secret;
var persistentKeys = {};
var db = require('./db')
var async = require('async');
var Promise = require('bluebird');
var uniquer = require('./uniquer');
var tagParser = require('./tagParser');
var upload = require('./upload');
var config = require('./config.json');
apiKey = config.apiKey;
secret = config.secret;

async.whilst(
    function() {
        return true
    },
    function(dailyUpdate) {
        console.log('Updating Shopify Inventory')

        db.ShopifyAccount.find({}, function(err, accounts) {
            async.eachSeries(accounts, function iterator(account, finishedAccount) {

                var url = 'http://' + account.shop.trim() + '/admin/products.json?scope=read_products'
                var options = {
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13',
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': account.token
                    }
                };

                request.get(options, function(error, response, body) {
                    if ((!error) && (response.statusCode == 200)) {
                        body = JSON.parse(body);
                        if (!body.products || body.products.length < 1) {
                            console.log('\n\n\nEmpty response...\n\n\n')
                            return finishedAccount();
                        }

                        async.eachSeries(body.products, function iterator(product, finishedProduct) {

                          if (product.variants && product.variants.length > 0) {

                                async.eachSeries(product.variants, function iterator(variant, finishedVariant){



                                }, function finishedVariants() {


                                })

                          }
                      

                        }, function finishedProducts() {
                          
                            wait(function() {
                                finishedAccount();
                            }, 800);

                        })



                    } else {
                        if (error) {
                            console.log('getinventory error ')
                            reject(error)
                        } else {
                            console.log('bad response')
                            reject('Bad response from inventory request')
                        }
                    }
                });

            }, function finishedAccounts() {

            })




        })




        var shop = undefined,
            key = undefined;
        homelink = undefined;

        if (req.session.shopify) {
            shop = req.session.shopify.shop;
            console.log('shop stored in user session:', req.session);
            key = persistentKeys[shop];
            homelink = 'http://' + shop + '.myshopify.com';
        }

        if (req.query.shop) {
            shop = req.query.shop.replace(".myshopify.com", '');
            console.log('shop given by query:', shop);
            key = persistentKeys[shop];
        }

        if (shop !== undefined && key != undefined) {

            session = nodify.createSession(shop, apiKey, secret, key);

            if (session.valid()) {
                console.log('session is valid for <', shop, '>')

                session.order.all({
                    // limit: 5
                }, function(err, orders) {
                    // console.log('req.session:', req.session);
                    if (err) {
                        console.log('82: ', err)
                        return res.send(500);
                    }

                    session.product.all({
                        // limit: 10000
                    }, function(err, products) {
                        console.log("Products:", products.length);
                        if (err) {
                            console.log('There are no products!', err)
                            return res.send(404)
                        }

                        res.render("index", {
                            title: "Kipsearch Shopify",
                            current_shop: shop,
                            orders: orders,
                            products: products,
                            homelink: homelink
                        });


                    });

                });
            }
        } else {
            console.log('session is not valid yet, we need some authentication !')
            if (shop !== undefined)
                res.redirect('/login/authenticate?shop=' + shop);
            else
                res.redirect('/login')
        }
        console.log('Finished Updating Store.')
        setTimeout(dailyUpdate, 86399999); // Update Daily
    },
    function(err) {}
);