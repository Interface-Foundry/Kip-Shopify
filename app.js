/**
 * Module dependencies.
 */


//AUTOMATICALLY UPDATE INVENTORY DAILY
//
//INPUT FORM FOR USERS TO ENTER PHYSICAL STORE OR CHOOSE ONLINE ONLY OPTION
//

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
var upload = require('./upload')

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

app.use(require('prerender-node').set('prerenderServiceUrl', 'http://127.0.1.1:4000'));
app.use(require('prerender-node').set('protocol', 'https'));

// Routes
app.get('/', function(req, res) {
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
});



app.get('/add', function(req, res) {
    var shop = undefined,
        key = undefined;
    homelink = undefined;

    if (req.session.shopify) {
        shop = req.session.shopify.shop;
        // console.log('shop stored in user session:', shop);
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
                    throw err;
                }

                session.product.all({
                    // limit: 10000
                }, function(err, products) {
                    // console.log("Products:", products.length);
                    if (err) {
                        console.log('There are no products!', err)
                        return res.send(404)
                    }

                    async.eachSeries(products, function iterator(product, finishedProduct) {
                        console.log('Product: ', JSON.stringify(product));

                        var productTags = []
                        productTags = productTags.concat(product.tags.split(' '))
                        productTags.push(product.vendor)
                        productTags.push('Shopify')
                        if (product.productType !== '') {
                            productTags.push(product.productType);
                        }
                        if (product.variants.length < 1 || !product.variants) {
                            console.log('This product has no variants.');
                            return finishedProduct();
                        }

                        var awsImages = []

                        function getImages(product) {
                            return new Promise(function(resolve, reject) {
                                if (product.images && product.images.length > 0) {
                                    var tempImgs = product.images.map(function(obj) {
                                        return obj.src
                                    })
                                    upload.uploadPictures('shopify_' + product.id.toString().trim() + product.title.replace(/\s/g, '_'), tempImgs).then(function(images) {
                                        awsImages = images;
                                        resolve(awsImages)
                                    }).catch(function(err) {
                                        if (err) console.log('Image upload error: ', err);
                                        resolve()
                                    })
                                }
                            })
                        }

                        getImages(product).then(function(awsImages) {
                            async.eachSeries(product.variants, function itertor(variant, finishedVariant) {

                                // console.log('Variant: ', variant.title)

                                //Check if this item exists
                                db.Landmarks.findOne({
                                    'id': variant.id.toString().trim(),
                                    'linkback': req.session.shopify.shop + '.myshopify.com',
                                    'linkbackname': 'myshopify.com'
                                }, function(err, match) {
                                    if (err) {
                                        console.log('103: ', err)
                                        return finishedVariant();
                                    }
                                    if (!match) {
                                        //Create new item for each store in inventory list.
                                        var i = new db.Landmark();
                                        i.itemImageURL = awsImages;
                                        // i.parents = updatedInv[0];
                                       
                                        //Lets put online-only stuff in the south-pole, will have to modify search to include south-pole results universally
                                        i.loc.type = 'MultiPoint'
                                        i.loc.coordinates = [
                                            [0, -90]
                                        ];
                                        i.parents = []
                                        i.world = false;
                                        i.price = parseFloat(variant.price);

                                        if (variant.title !== 'Default Title') {
                                            i.name = variant.title.replace(/[^\w\s]/gi, '');
                                        } else {
                                            i.name = product.title
                                        }
                                        i.linkback = req.session.shopify.shop + '.myshopify.com';
                                        i.linkbackname = 'myshopify.com';
                                        var tags = i.name.split(' ').map(function(word) {
                                            return word.toString().toLowerCase()
                                        });
                                        tags = tags.concat(productTags);
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
                                        i.id = variant.id.toString().trim();

                                        i.save(function(e, item) {
                                            if (e) {
                                                console.log('452: ', e);
                                            } else {
                                                console.log('Shopify item saved to db: ', item)
                                            }
                                            wait(finishedVariant, 1000);
                                        })

                                    } else if (match) {

                                        console.log('Item exists in db: ', match.name)
                                        wait(finishedVariant, 1000);

                                        // console.log('Item exists! : ', match)
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
                    })

                    res.render("added", {
                        title: "Kipsearch Inventory Added",
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


var port = process.env.PORT || 4000;

app.listen(port, function() {

    console.log("Running on: ", app.address().port);
});