//Loading bar

var express = require('express'),
    routes = require('./routes')
var cookieParser = require('cookie-parser');
var app = module.exports = express();
var nodify = require('nodify-shopify');
var bodyParser = require('body-parser');
var path = require('path')
var apiKey, secret;
var persistentKeys = {};
var db = require('./IF_schemas/db')
var mongoose = require('mongoose')
var ObjectId = mongoose.Types.ObjectId;
var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var uniquer = require('./uniquer');
var tagParser = require('./tagParser');
var upload = require('./upload')
var request = require('request')
var session = require('express-session')
var MongoStore = require('connect-mongo')(session);
var config = require('./config/')
var keys = require('./config.json');
apiKey = keys.apiKey;
secret = keys.secret;

// Configuration
// console.log('DIR: ', path.join(__dirname, 'public'))
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(session({
    secret: 'zergrushkekeke',
    store: new MongoStore({
        //***Production: This must be change to:
        //mongooseConnection: 'mongodb://flareon.kipapp.co/foundry'
         url: config.mongodb.url
    }),
    resave: true,
    saveUninitialized: true
}));

// app.use(require('prerender-node').set('prerenderServiceUrl', 'http://127.0.1.1:4000'));
app.use(require('prerender-node').set('protocol', 'https'));

app.get('/healthcheck', function(req, res) {
  console.log('healthcheck');
  res.send(200);
})

// Routes
app.get('/', function(req, res) {
    var shop = undefined,
        key = undefined;
    homelink = undefined;
    if (req.session.shopify) {
        shop = req.session.shopify.shop;
        console.log('shop stored in user session:', req.session);
        key = persistentKeys[shop];
        homelink = 'https://' + shop + '.myshopify.com';
    }
    if (req.query.shop) {
        shop = req.query.shop.replace(".myshopify.com", '');
        console.log('shop given by query:', shop);
        key = persistentKeys[shop];
    }
    if (shop !== undefined && key != undefined) {

        storeExists = false;

        //Check if store exists in DB
        db.Landmarks.findOne({
            'id': 'shopify_' + shop.toString().trim(),
            'linkbackname': 'myshopify.com'
        }, function(err, match) {
            if (err) {
                console.log('150: ', err)
            }
            if (match) {
                console.log('Store exists!', match.name)
                storeExists = true;
            } else {
                storeExists = false;
            }
            session = nodify.createSession(shop, apiKey, secret, key);
            if (session.valid()) {
                console.log('session is valid for <', shop, '>')
                session.product.all({
                    // limit: 10000
                }, function(err, products) {
                    // console.log("Products:", products.length);
                    if (err) {
                        console.log('There are no products!', err)
                        return res.send(404)
                    }
                    res.render("index", {
                        title: "Kipsearch Shopify",
                        current_shop: shop,
                        storeExists: storeExists,
                        homelink: homelink
                    });
                });
            }
        })
    } else {
        console.log('session is not valid yet, we need some authentication !')
        if (shop !== undefined) {
            res.redirect('/login/authenticate?shop=' + shop);
        } else {
            res.redirect('/login')
        }

    }
});



app.get('/login', function(req, res) {

    try {
        shop = res.body.shop;
    } catch (error) {
        shop = undefined;
    }
    if (req.session.shopify) {
        res.redirect('/');
    } else if (shop != undefined) {
        //redirect to auth
        res.redirect(req.originalUrl + "authenticate");
        console.log('181')
            // authenticate(req,res)
    } else {
        res.render("login", {
            title: "Kipsearch Inventory Manager"
        });
    }
});

app.post('/login/authenticate', authenticate);
app.get('/login/authenticate', authenticate);

function authenticate(req, res) {
    console.log('Authenticating...')
    var shop = req.query.shop || req.body.shop;
    if (shop !== undefined && shop !== null) {
        console.log('creating a session for', shop, apiKey, secret)
        session = nodify.createSession(shop, apiKey, secret, {
            scope: {
                products: "read"
            },
            uriForTemporaryToken: "https://kipapp.co/shopify/login/finalize/token",
            onAskToken: function onToken(err, url) {
                if (err) console.log('131: ', err)
                console.log('URL: ', url)
                res.redirect(url);
            }
        });
    } else {
        console.log('no shop, go login')
        res.redirect('/login');
    }
}

app.get('/login/finalize', function(req, res) {
    console.log('/login/finalize')
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
    console.log('/login/finalize/token')
    if (!req.query.code)
        return res.redirect("/login?error=Invalid%20connection.%20Please Retry")
    session.requestPermanentAccessToken(req.query.code, function onPermanentAccessToken(token) {
        console.log('Authenticated on shop <', req.query.shop, '/', session.store_name, '> with token <', token, '>')
        persistentKeys[session.store_name] = token;
        req.session.shopify = {
            shop: session.store_name
        };

        //Create a Shopify Account
        db.Credentials.findOne({
            'shop': req.query.shop.trim()
        }, function(err, match) {
            if (err) {
                console.log('103: ', err)
            }
            if (!match) {
                //Store shopify users account data
                var s = new db.Credential();
                s.name = session.store_name.trim();
                s.shop = req.query.shop.trim();
                s.token = token;
                s.vendor = 'shopify'
                s.save(function(err, saved) {
                    if (err) console.log(err)
                    console.log('Shopify user saved: ', saved);
                    return res.redirect('/')
                })
            } else if (match) {
                res.redirect('/')
            }
        })
    })
})

app.post('/add', function(req, res) {

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
    data.online = req.body.online ? true : false

    if (req.session.shopify) {
        data.shop = req.session.shopify.shop;
        data.key = persistentKeys[data.shop];
        data.homelink = 'https://' + data.shop.toString().trim() + '.myshopify.com';
    }
    if (req.query.shop) {
        data.shop = req.query.shop.replace(".myshopify.com", '');
        console.log('shop given by query:', data.shop);
        data.key = persistentKeys[data.shop];
    }
    if (data.shop !== undefined && data.key != undefined) {
        session = nodify.createSession(data.shop, apiKey, secret, data.key);
        if (session.valid()) {
            // console.log('\n\nreq.body: ',req.body)
            if (req.body.exists == 'false') {
                processData(data, session, res).then(function(parent) {
                    var coordinates = parent ? parent.loc.coordinates : [0, -90]
                    var location = (data.city && data.state) ? (data.city + "," + data.state) : 'My Location'
                    res.render("added", {
                        title: "Kipsearch Inventory Added",
                        searchquery: data.shop.replace(/[^\w\s]/gi, ' '),
                        homelink: data.homelink,
                        coords: coordinates,
                        loc: location
                    })
                }).catch(function(err) {
                    console.log('270: ', err)
                })
            } else {
                update(data).then(function(parent) {
                    var coordinates = parent ? parent.loc.coordinates : [0, -90]
                    var location = (data.city && data.state) ? (data.city + "," + data.state) : 'My Location'
                    res.render("added", {
                        title: "Kipsearch Inventory Added",
                        searchquery: data.shop.replace(/[^\w\s]/gi, ' '),
                        homelink: data.homelink,
                        coords: parent.loc.coordinates,
                        loc: data.city + "," + data.state
                    })
                }).catch(function(err) {
                    console.log('286: ', err)
                })
            }

        }
    } else {
        console.log('session is not valid yet, we need some authentication !')
        if (shop)
            res.redirect('/login/authenticate?shop=' + shop);
        else
            res.redirect('/login')
    }
});


app.get('/logout', function(req, res) {
    if (req.session.shopify) {
        req.session.shopify = null;
    }
    console.log('Logged out!')
    res.redirect('/');
});

function processData(data, session, res) {
    return new Promise(function(resolve, reject) {
        getParent(data).then(function(parent) {
            session.product.all({}, function(err, products) {
                if (err) {
                    console.log('There are no products!', err)
                    return res.send(404)
                }
                async.eachSeries(products, function iterator(product, finishedProduct) {
                    // console.log('\n\nProduct: ', JSON.stringify(product), '\n\n');
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

                            if (variant.inventory_management == 'shopify' && variant.inventory_policy == 'deny' && variant.inventory_quantity && variant.inventory_quantity < 1) {
                                return finishedVariant();
                            }

                            db.Landmarks.findOne({
                                'id': 'shopify_' + variant.id.toString().trim(),
                                'source_generic_item.product_name': product.title,
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
                                    i.loc.type = 'MultiPoint';
                                    i.loc.coordinates = parent ? [parent.loc.coordinates] : [
                                        [0, -90]
                                    ];
                                    i.source_generic_item = {
                                        product_name: product.title,
                                        product_description: product.body_html,
                                        shop: data.shop.replace(/[^\w\s]/gi, ' ').split(' ').join(' '),
                                        inventory_tracked: (variant.inventory_management == 'shopify' && variant.inventory_policy == 'continue') ? true : false,
                                        inventory_quantity: (variant.inventory_management == 'shopify' && variant.inventory_policy == 'continue' && variant.inventory_quantity && variant.inventory_quantity > 0) ? variant.inventory_quantity : undefined
                                    }
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
                                        finishedVariant();
                                    })
                                } else if (match) {
                                    console.log('Item exists in db: ', match.name)
                                        //TODO: Update Item
                                    finishedVariant();
                                }
                            })
                        }, function finishedVariants(err) {
                            console.log('Finished product.')
                            finishedProduct();
                        })
                    })
                }, function finishedProducts(err) {
                    console.log('Finished all products.')
                    if (err) console.log('452', err)
                    resolve(parent);
                })

            })
        })
    })
}


function getParent(data) {
    return new Promise(function(resolve, reject) {
        // if (data.online) {
        //     console.log('This is an online only store.')
        //     return resolve()
        // }
        //Create Parent in DB
        db.Landmarks.findOne({
            'id': 'shopify_' + data.shop,
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
                n.addressString = !data.online ? (data.street + ', ' + data.city + ', ' + data.state + ' ' + data.zipcode) : 'Online only'
                getLatLong(n.addressString).then(function(coords) {
                    n.hasloc = true;
                    n.loc.type = 'Point'
                    n.source_generic_store = {
                        street: data.street,
                        city: data.city,
                        state: data.state,
                        zipcode: data.zipcode,
                        tel: data.tel,
                        online: data.online
                    }
                    n.loc.coordinates = coords;
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

        if (address == 'Online only') {
            return resolve([0, -90])
        }

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


function update(data) {
    return new Promise(function(resolve, reject) {
        console.log('\nUpdating shop: ', data.shop)
        db.Landmarks.findOne({
            'id': 'shopify_' + data.shop,
            'world': true
        }, function(err, shop) {
            if (err) console.log('31: ', err)
            if (!shop) {
                console.log('33: Shop Not found!')
                return reject('Shop not found.')
            }
            // console.log('Shop found: ', shop._id.toString().trim())
            // var sid = new ObjectId(shop._id);
            db.Landmarks.find({
                'parents': shop._id
            }, function(err, olditems) {
                if (err) console.log('31: ', err)

                if (!olditems || (olditems && olditems.length < 1)) {
                    console.log('46: No items found for this shop!')
                    return resolve()
                }

                console.log('Found ', olditems.length, ' existing item(s).')

                old_items = olditems.map(function(item) {
                    return 'shopify_' + item.id.toString().trim()
                })

                var url = 'https://' + shop.name.toString().trim() + '.myshopify.com/admin/products.json?scope=read_products'
                var options = {
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13',
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': data.key
                    }
                };
                // console.log('GET URL: ', url)
                request(options, function(error, response, body) { 
                    if ((!error) && (response.statusCode == 200)) {
                        body = JSON.parse(body);
                        if (!body.products || body.products.length < 1) {
                            console.log('\n\n\nEmpty response...\n\n\n')
                            return resolve();
                        }
                        async.eachSeries(body.products, function iterator(product, finishedProduct) {
                            console.log('This product has ', product.variants.length, ' variants.')
                            if (product.variants && product.variants.length < 1) {
                                return finishedProduct()
                            }
                            new_items = product.variants.map(function(variant) {
                                return 'shopify_' + variant.id.toString().trim()
                            })
                            removeDeprecatedItemsFromDb(old_items, new_items).then(function() {

                                    async.eachSeries(product.variants, function iterator(variant, finishedVariant) {
                                        console.log('\n\nStarting variant: ', product.title, variant.id)
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
                            resolve(shop);
                        })
                    } else {
                        if (error) {
                            console.log('Shopify API error ', error)
                            resolve(shop);
                        } else {
                            console.log('bad response', body)
                            resolve(shop);
                        }
                    }
                });
            })
        })
    })
}


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
                // console.log('Updated inventory: ', result.result.ok, result.result.n)
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


var port = 4000;

if (module.parent) {
    module.exports = app
} else {
    app.listen(port, function() {
        // console.log("Running on: ", app.address().port);
    });
}
