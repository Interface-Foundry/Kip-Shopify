/**
 * Module dependencies.
 */

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

//If Heroku or Foreman
if (process.env.SHOPIFY_API_KEY != undefined && process.env.SHOPIFY_SECRET != undefined) {
    apiKey = process.env.SHOPIFY_API_KEY;
    secret = process.env.SHOPIFY_SECRET;
} else {
    var config = require('./config.json');
    apiKey = config.apiKey;
    secret = config.secret;
}

// Configuration

app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({
        secret: "shhhhh!!!!"
    }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function() {
    app.use(express.errorHandler({
        dumpExceptions: true,
        showStack: true
    }));
});

app.configure('production', function() {
    app.use(express.errorHandler());
});

// Routes
app.get('/', function(req, res) {
    var shop = undefined,
        key = undefined;

    if (req.session.shopify) {
        shop = req.session.shopify.shop;
        console.log('shop stored in user session:', shop);
        key = persistentKeys[shop];
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
                limit: 5
            }, function(err, orders) {
                // console.log('req.session:', req.session);
                if (err) {
                    throw err;
                }

                session.product.all({
                    limit: 5
                }, function(err, products) {
                    console.log("products:", products);
                    if (err) {
                        throw err;
                    }

                    async.eachSeries(products, function iterator(product, finishedProduct) {
                        // console.log('product.variants: ',product.variants)

                        async.eachSeries(product.variants, function itertor(variant, finishedVariant) {

                            //Check if this item exists
                            db.Landmarks.findOne({
                                'id': variant.id,
                                'linkback': req.session.shopify.shop   + '.myshopify.com',
                                'linkbackname': 'shopify.com'
                            }, function(err, match) {
                                if (err) {
                                    console.log('103: ', err)
                                    return finishedVariant();
                                }
                                if (!match) {
                                    //Create new item for each store in inventory list.
                                    var i = new db.Landmark();
                                    // i.parents = updatedInv[0];
                                    i.loc.coordinates = [[0,90]];
                                    i.parents = []
                                    i.world = false;
                                    // i.source_generic_item = item;
                                    // delete i.source_generic_item.storeIds;
                                    i.price = parseFloat(variant.price);
                                    i.itemImageURL = variant.images;
                                    i.name = variant.title.replace(/[^\w\s]/gi, '');
                                    // i.owner = owner;
                                    i.linkback = req.session.shopify.shop  + '.myshopify.com';
                                    i.linkbackname = 'myshopify.com';
                                    // var tags = i.name.split(' ').map(function(word) {
                                    // return word.toString().toLowerCase()
                                    // });
                                    // tags = tags.concat(item.descriptionTags);
                                    // tags.forEach(function(tag) {
                                    // i.itemTags.text.push(tag)
                                    // });
                                    // i.itemTags.text.push('Macys');
                                    // i.itemTags.text.push(cat)
                                    try {
                                        // i.itemTags.text = tagParser.parse(i.itemTags.text)
                                    } catch (err) {
                                        // console.log('tagParser error: ', err)
                                    }
                                    i.hasloc = true;
                                    i.loc.type = 'MultiPoint';
                                    if (!i.name) {
                                        i.name = 'Shopify'
                                    }
                                    i.id = variant.id;
                                    i.save(function(e, item) {
                                        if (e) {
                                            console.log('452: ', e);
                                        } else {
                                            // savedItems.push(item)
                                            console.log('Saved: ', item)
                                        }

                                        wait(finishedVariant, 1000);
                                    })


                                } else if (match) {

                                	console.log('Item exists! : ',match)
                                    // db.Landmarks.findOne({
                                    //     '_id': match._id,
                                    //     'linkbackname': 'shopify.com'
                                    // }).update({
                                    //     $set: {
                                    //         'parents': updatedInv[0],
                                    //         'loc.coordinates': updatedInv[1],
                                    //         'updated_time': new Date()
                                    //     }
                                    // }, function(e, result) {
                                    //     if (e) {
                                    //         console.log('Inventory update error: ', e)
                                    //     }
                                    //     // console.log('Updated inventory for item:', match.id)
                                    //     wait(callback, 1000);
                                    // })
                                }
                            })

                        }, function done(err) {
                            finishedProduct()
                        })

                    }, function done(err) {
                        if (err) console.log(err)



                    })

                    res.render("index", {
                        title: "Kipsearch Inventory Dump",
                        current_shop: shop,
                        orders: orders,
                        products: products
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
});


app.get('/login', function(req, res) {
    try {
        shop = res.body.shop;
    } catch (error) {
        shop = undefined;
    }

    if (req.session.shopify) {
        res.redirect("/");
    } else if (shop != undefined) {
        //redirect to auth
        res.redirect("/login/authenticate");
    } else {
        res.render("login", {
            title: "Kipsearch Inventory Manager"
        });
    }
});

app.post('/login/authenticate', authenticate);
app.get('/login/authenticate', authenticate);

function authenticate(req, res) {
    var shop = req.query.shop || req.body.shop;
    if (shop !== undefined && shop !== null) {
        console.log('creating a session for', shop, apiKey, secret)
        session = nodify.createSession(shop, apiKey, secret, {
            scope: {
                orders: "read",
                products: "read"
            },
            uriForTemporaryToken: "http://" + req.headers.host + "/login/finalize/token",
            onAskToken: function onToken(err, url) {
                res.redirect(url);
            }
        });
    } else {
        console.log('no shop, go login')
        res.redirect('/login');
    }
}

app.get('/login/finalize', function(req, res) {
    console.log('finalizing ...', req.query)
    params = req.query;
    req.session.shopify = params;
    params.onAskToken = function(err, url) {
        if (err) {
            res.send("Could not finalize");
            console.warn('Could not finalize login :', err)
        }
        res.redirect(url);
    }

    session = nodify.createSession(req.query.shop, apiKey, secret, params);
    if (session.valid()) {
        console.log('session is valid!')
        res.redirect("/");
    } else {
        res.send("Could not finalize");
    }
});

app.get('/login/finalize/token', function(req, res) {
    if (!req.query.code)
        return res.redirect("/login?error=Invalid%20connection.%20Please Retry")
    session.requestPermanentAccessToken(req.query.code, function onPermanentAccessToken(token) {
        console.log('Authenticated on shop <', req.query.shop, '/', session.store_name, '> with token <', token, '>')
        persistentKeys[session.store_name] = token;
        req.session.shopify = {
            shop: session.store_name
        };
        res.redirect('/')
    })
})

app.get('/logout', function(req, res) {
    if (req.session.shopify) {
        req.session.shopify = null;
    }
    console.log('Logged out!')
    res.redirect('/');
});


app.get('/plans', function(req, res) {
    if (req.session.shopify) {
        token = req.session.shopify.t
        shop = req.session.shopify.shop
    }

    if (shop !== undefined && token !== undefined) {
        res.render("plans", {
            title: "Nodify App Plans",
            current_shop: shop
        });
    } else {
        res.redirect('/login');
    }
});


app.get('/faq', function(req, res) {
    if (req.session.shopify) {
        token = req.session.shopify.t
        shop = req.session.shopify.shop
    }

    if (shop !== undefined && token !== undefined) {
        res.render("faq", {
            title: "Nodify App FAQ",
            current_shop: shop
        });
    } else {
        res.redirect('/login');
    }
});


function wait(callback, delay) {
    var startTime = new Date().getTime();
    while (new Date().getTime() < startTime + delay);
    callback();
}


var port = process.env.PORT || 3000;

app.listen(port, function() {

    console.log("Running on: ", app.address().port);
});