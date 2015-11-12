//AUTOMATICALLY UPDATE INVENTORY DAILY
//
//Progress bar to add items -- > PREVIEW LINK : SEARCH NAME OF STORE AND LOCATION ON KIPSEARCH
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
var request = require('request')

var config = require('./config.json');
apiKey = config.apiKey;
secret = config.secret;


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
        // console.log('shop stored in user session:', req.session);
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
                    products: products,
                    homelink: homelink
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



app.post('/add', function(req, res) {
    // console.log('REQ.BODY.ONLINE: ',req.body.online)
    var data = {
        shop: undefined,
        key: undefined,
        street: undefined,
        city: undefined,
        state: undefined,
        tel: undefined,
        online: undefined,
        homelink: undefined
    }

    data.street = req.body.street ? req.body.street : undefined;
    data.city = req.body.city ? req.body.city : undefined
    data.state = req.body.state ? req.body.state : undefined
    data.zipcode = req.body.zipcode ? req.body.zipcode : undefined
    data.tel = req.body.tel ? req.body.tel : undefined
    data.online = req.body.online ? true : undefined

    if (req.session.shopify) {
        data.shop = req.session.shopify.shop;
        data.key = persistentKeys[data.shop];
        data.homelink = 'http://' + data.shop.toString().trim() + '.myshopify.com';
    }
    if (req.query.shop) {
        data.shop = req.query.shop.replace(".myshopify.com", '');
        console.log('shop given by query:', data.shop);
        data.key = persistentKeys[data.shop];
    }
    if (data.shop !== undefined && data.key != undefined) {
        session = nodify.createSession(data.shop, apiKey, secret, data.key);
        if (session.valid()) {
            process(data, session, res).then(function() {
                // console.log('DONESKIIYEEEEEE')
                res.render("added", {
                    title: "Kipsearch Inventory Added",
                    current_shop: data.shop,
                    homelink: homelink
                })
            }).catch(function(err) {
                console.log('There was an error: ', err)
            })
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

        //Create a Shopify Account
        db.ShopifyAccount.findOne({
            'shop': req.query.shop.trim()
        }, function(err, match) {
            if (err) {
                console.log('103: ', err)

            }
            if (!match) {
                //Store shopify users account data
                var s = new db.ShopifyAccount();
                s.name = session.store_name.trim();
                s.shop = req.query.shop.trim();
                s.token = token
                s.save(function(err, saved) {
                    if (err) console.log(err)
                    console.log('Shopify user saved: ', saved);
                    return res.redirect('/')
                })
            } else if (match) {
                // console.log('Exists!!: ',match)
                res.redirect('/')
            }
        })
    })
})

app.get('/logout', function(req, res) {
    if (req.session.shopify) {
        req.session.shopify = null;
    }
    console.log('Logged out!')
    res.redirect('/');
});

function getParent(data) {
    return new Promise(function(resolve, reject) {
        if (data.online) {
            console.log('This is an online only store.')
            return resolve()
        }
        //Create Parent in DB
        db.Landmarks.findOne({
            'id': data.shop.trim(),
            'linkbackname': 'myshopify.com'
        }, function(err, match) {
            if (err) {
                console.log('150: ', err)
            }
            if (!match) {
                //Create new parent store 
                var n = new db.Landmark();
                n.world = true;
                n.tel = data.tel;
                n.name = data.shop;
                n.linkback = data.shop;
                n.linkbackname = 'myshopify.com'
                n.addressString = data.street + ', ' + data.city + ', ' + data.state + ' ' + data.zipcode;
                getLatLong(n.addressString).then(function(coords) {
                    n.hasloc = true;
                    n.loc.type = 'Point'
                    n.source_generic_store = {
                        street: data.street,
                        city: data.city,
                        state: data.state,
                        zipcode: data.zipcode,
                        tel: data.tel
                    }
                    n.loc.coordinates = coords;
                    n.name = n.id;
                    linkback = data.homelink;
                    linkbackname = 'myshopify.com';
                    uniquer.uniqueId('shopify ' + data.shop.trim(), 'Landmark').then(function(output) {
                        n.id = output;
                        n.save(function(e, newStore) {
                            if (e) {
                                return console.log('170: ', e)
                            }
                            console.log('Saved store:', newStore.name)
                            return resolve(newStore)
                        })
                    })
                }).catch(function(err) {
                    console.log('Parent Lat/Lng Retrieve Error: ', err)
                })
            } else if (match) {
                console.log('Parent exists in db: ', match.name)
                resolve(match)
            }
        })
    })
}

function getLatLong(address) {
    return new Promise(function(resolve, reject) {
        var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + address + '&key=AIzaSyCgb5KIu9JL3CxMP5YF7nFCfAbPxvoNIbM'
        request({
                url: url
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    body = JSON.parse(body);
                    // console.log('BODY: ', body)

                    if (body.results[0] && body.results[0].geometry && body.results[0].geometry.location && body.results[0].geometry.location.lng) {
                        var coords = [body.results[0].geometry.location.lng, body.results[0].geometry.location.lat]
                        return resolve(coords)
                    } else {
                        console.log('Google Maps API error')
                        reject()
                    }
                } else {
                    console.log('324: Error: ', error)
                    reject(error)
                }
            });
    })
}

function process(data, session, res) {
    return new Promise(function(resolve, reject) {

        getParent(data).then(function(parent) {
            session.product.all({}, function(err, products) {
                // console.log("Products:", products.length);
                if (err) {
                    console.log('There are no products!', err)
                    return res.send(404)
                }
                async.eachSeries(products, function iterator(product, finishedProduct) {
                    // console.log('Product: ', JSON.stringify(product));
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
                    getImages(product).then(function(awsImages) {
                        async.eachSeries(product.variants, function iterator(variant, finishedVariant) {
                            // console.log('Variant: ', variant.title)
                                //Check if this item exists
                            db.Landmarks.findOne({
                                'id': 'shopify_' + variant.id.toString().trim(),
                                'linkback': data.homelink,
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
                                    //Lets put online-only stuff in the south-pole, will have to modify search to include south-pole results universally
                                    i.loc.type = 'MultiPoint'
                                    i.loc.coordinates = parent ? [parent.loc.coordinates] : [
                                        [0, -90]
                                    ];
                                    i.parents = parent ? [parent._id] : [];
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
                                        wait(finishedVariant, 1000);
                                    })
                                } else if (match) {
                                    console.log('Item exists in db: ', match.name)
                                        //TODO: Update Item
                                    wait(finishedVariant, 1000);
                                }
                            })
                        }, function finishedVariants(err) {
                            console.log('Finished product.')
                            wait(finishedProduct, 1000);
                        })
                    })
                }, function finishedProducts(err) {
                    console.log('Finished all products.')
                    if (err) console.log('452', err)

                    resolve();
                })

            })
        })
    })
}



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

function wait(callback, delay) {
    var startTime = new Date().getTime();
    while (new Date().getTime() < startTime + delay);
    callback();
}


var port = 4000;

app.listen(port, function() {

    console.log("Running on: ", app.address().port);
});