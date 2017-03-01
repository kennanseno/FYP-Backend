var express = require('express');
var _ = require('lodash');
var app = express();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');
var geolib = require('geolib');
var Simplify = require("simplify-commerce");

app.use(bodyParser());
app.use(express.static('public'));

var mongoUrl = 'mongodb://localhost:3001/FYP',
	path = '/fyp',
	database,
	TEST_COLLECTION = 'TESTCOLLECTION',
	PROD_COLLECTION = 'production';

var DEV_MODE = true; //IF ON DEV PHASE
var collectionUsed = DEV_MODE ? TEST_COLLECTION : PROD_COLLECTION;

MongoClient.connect(mongoUrl, function(err, db) {
	if(err) {
		return console.log(err);
	}

	database = db;
	app.listen(3000, function() {
		console.log('Application listening on Port 3000');
	});
});

app.get(path + '/findUser', function(req, res) {
	var data = {
		username: req.query.username,
		password: req.query.password
	};
	
	var params = {
		username: true,
		email: true,
		name: true,
		address: true
	};

	findDocuments(database, data, params, function(docs) {
		res.send(docs);	
	});
});

app.get(path + '/getStore', function(req, res) {
	var data = {
		username: req.query.username
	};
	
	var params = {
		stores: true
	};

	findDocuments(database, data, params, function(docs) {
		res.send(docs);	
	});
});

// Gets store products and payment method
app.get(path + '/getStoreDetails', function(req, res) {
	var params = [
		{ $unwind: '$stores' },
		{ $match: {'stores.id': ObjectId(req.query.store_id)} },
		{ $project: {'products': '$stores.products', 'paymentMethod': '$stores.paymentMethod.id'} }
	];

	aggregate(database, params, function(docs) {
		res.send(docs);	
	});
});

app.get(path + '/searchNearbyStores', function(req, res) {
	var lat = geolib.useDecimal(req.query.latitude),
		long = geolib.useDecimal(req.query.longitude),
		radius = req.query.radius;

	var params = [
   		{ $unwind: '$stores' },
    	{ $project: {
			'id': '$stores.id',
			'name': '$stores.name', 
			'description': '$stores.description', 
			'owner': '$username', 
			'location': '$stores.location' }
		}
	];

	aggregate(database, params, function(docs) {
		var result = [];
		docs.forEach(function(store) {
			var distance = geolib.getDistance(
    			{ latitude: lat, longitude: long },
    			{ latitude: store.location.latitude, longitude: store.location.longitude }
			);

			var distanceInKilometers = geolib.convertUnit('km', distance, 1);
			console.log(distanceInKilometers);

			//check if store is within proximity search radius
			if(distanceInKilometers <= radius) {
				result.push(store);
			}
		})
		res.json(result);	
	});
});

app.post(path + '/registerUser', function(req, res) {
	var data = {
		username: req.body.username,
		email: req.body.email,
		password: req.body.password,
		name: req.body.name,
		address: req.body.address,
		cart: {},
		stores: []
	};

	insertDocument(database, data, function(result) {
		console.log('New User added!');
		res.send(result.result);
	});
});

app.post(path + '/createStore', function(req, res) {
	var params = { username: req.body.username },
		data = { 
			$push: { 
				stores: {
					id: ObjectId(),
					name: req.body.name,
					description: req.body.description,
					address: req.body.address,
					location: req.body.location,
					products: []
				} 
			}
		};
	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/addProduct', function(req, res) {
	var params = {
		'stores.id': ObjectId(req.body.store_id)
	},
	productData = req.body.data,
	data = { 
		$push: { 
			'stores.$.products' : {
				'_id': productData.code,
				'name': productData.name,
				'description': productData.description,
				'price': productData.price
			} 
		}
	};

	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/addToCart', function(req, res) {
	var params = {
		'username': req.body.username
	};

	findDocuments(database, params, { 'cart': true }, function(doc) {
		var productData = req.body.data;
		var data;

		if(_.keys(doc[0].cart).length > 0) {
			data = { 
				$addToSet: { 
					'cart.products' : {
						product_id: productData.product_id,
						quantity: productData.quantity
					}
				}
			}
		} else {
			//if no product exist in cart
			data = { 
				$set: { 
					'cart' : {
						store_id: productData.store_id,
						products: [{
							product_id: productData.product_id,
							quantity: productData.quantity
						}]
					}
				}
			}
		}
		updateDocuments(database, params, data, function(result) {
			res.send(result.result)
		});
	});

});


app.post(path + '/addPaymentMethod', function(req, res) {
	var params = {
		'stores.id': ObjectId(req.body.params.store_id)
	},
	data = { 
		$set: { 'stores.$.paymentMethod' : req.body.key }
	};
	
	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});

app.get(path + '/removeUser', function(req, res) {
	var data = {
		username: req.query.username
	};

	removeDocument(database, data, function(result) {
		res.send(data.username + ' successfully removed!');
	});
});


/**
 * Gets Product details of products that are in the user's cart
 */
app.get(path + '/getCartData', function(req, res) {
	var data = { username: req.query.username };	
	var params = { cart: true };
	
	findDocuments(database, data, params, function(docs) {
		var cart = docs[0].cart;
		var result= {
			store_id: cart.store_id,
			products: []
		};

		var products = cart.products;
		products.forEach(function(object, index) {
			var params = [
				{ $unwind: '$stores' },
				{ $match: {'stores.id': ObjectId(cart.store_id) } },
				{ $project: { 'products': '$stores.products' } },
				{ $unwind: '$products' },
				{ $match: {'products._id': object.product_id } }
			];

			aggregate(database, params, function(details) {
				details[0].products.quantity = object.quantity; //inject quantity of each product in cart. FIND BETTER SOLUTION!
				
				//hack for now to add store owner/name
				result.products.push(details[0].products);
				if (index === products.length - 1) {
					res.send(result);
				}
			});

		});		
	});
});

app.get(path + '/productExists', function(req, res) {
	var params = [
		{ $unwind: '$stores' },
		{ $match: { 'stores.id': ObjectId(req.query.store_id) } },
		{ $unwind: '$stores.products' },
		{ $project: {'products': '$stores.products'} },
		{ $match: { 'products._id': req.query.product_id} }
	];

	aggregate(database, params, function(docs) {
		//returns false if no documents exist
		if(docs.length === 0) {
			res.send(false);
			return;
		}
		res.send(true);	
	});
});

//change to  aggregate to find store
app.post(path + '/pay', function(req, res) {
	var store_id = req.body.store_id;
		data = {
			amount: _.toString(req.body.amount),
			description: 'TEST',
			card: {
				number: req.body.card.number.replace(/ /g, ""),
				expMonth: req.body.card.expiration.slice(0, 2),
				expYear: req.body.card.expiration.slice(3, 5),
				cvc: _.toString(req.body.card.cvc)
			},
			currency: req.body.currency
		};
		console.log('store_id:', store_id);
		console.log('data:', data);
		console.log('card:', data.card);

	var params = [
		{ $unwind: '$stores' },
		{ $match: { 'stores.id': ObjectId(req.body.store_id) } },
		{ $project: { 'username': '$username', 'store_id': '$stores.id', 'paymentMethod': '$stores.paymentMethod' }}
	];
	aggregate(database, params, function(doc) {
		var result = doc[0];

		console.log('result:', result);
		if(result.paymentMethod.id == 'SIMPLIFY') {
			simplifyPayment(result.paymentMethod, data)
		} else if(result.paymentMethod.id == 'STRIPE') {
			stripePayment(result.paymentMethod, data)	
		}
	});
	
});

var stripePayment = function(key, data) {
	var stripe = require("stripe")(key.publicKey);

	stripe.tokens.create({
		card: {
			"number": data.card.number,
			"exp_month": data.card.expMonth,
			"exp_year": data.card.expYear,
			"cvc": data.card.cvc
		}
	}, function(err, token) {
		stripe.charges.create({
			amount: data.amount,
			currency: data.currency,
			description: data.description,
			source: token,
		},  function(err, charge) {
			console.log('Stripe charge:', charge);
		});
	});
}

var simplifyPayment = function(key, data) {
	client = Simplify.getClient({
		publicKey: key.publicKey,
		privateKey: key.privateKey
	});

	transactionData = {
		amount: data.amount,
		currency: data.currency,
		card: {
			number: data.card.number,
			expMonth: data.card.expMonth,
			expYear: data.card.expYear,
			cvc: data.card.cvc
		}
	}

	client.payment.create( transactionData, function(errData, data) {
		if(errData) {
			console.error("Error Message:", errData.data.error.message);
//			res.send("Payment Status:", JSON.stringify(errData));
			return;
		}

		console.log("Payment Status:", data.paymentStatus);
//		res.send("Payment Status:", JSON.stringify(errData));
	})
}

/* ------------ TEST CODE -------------------- */

app.get(path + '/test/insertTestUser', function(req, res) {
	var testUser = {
		username: 'test',
		email: 'test@test.com',
		password: 'test',
		name: 'Test Test',
		address: '25 test St., Test',
		cart: {},
		stores: [
			{
				id: ObjectId(),
				name: 'Store 1',
				description: 'Store 1',
				address: '24 millstead',
				location: {
					latitude: 53.33785738724721,
					longitude: -6.267085527951525
				},
				paymentMethod: {
					id: 'STRIPE',
					publicKey: 'pk_test_Aaj7yDk5sGdshHsOM9qCXCAY'
				},
				products: []
			},
			{
				id: ObjectId(),
				name: 'Store 2',
				description: 'Most awesome store!',
				address: '25 millstead',
				location: {
					latitude: 53.33785738724761,
					longitude: -6.267085527951536
				},
				paymentMethod: {
					id: 'SIMPLIFY',
					publicKey: 'sbpb_N2ZjYTQ2NWUtZTVlMC00MDJiLTgyOGMtODYxMjM3OTY1MWVh',
					privateKey: 'qY1HX8kEexQ/uKRTPloEMIRZj8hLBFD5yIVbI5NjY555YFFQL0ODSXAOkNtXTToq'
				},
				products: []
			}
		]
	};

	insertDocument(database, testUser, function(result) {
		res.send('Test user Added!');
	});
});

app.get(path + '/test/removeTestUser', function(req, res) {
	var testUser = {username: 'test', password: 'test'};

	removeDocument(database, testUser, function(result) {
		res.send(result);
	});

});

app.get(path + '/test/find', function(req, res) {
	var data = {},
		params = {
			password: false
		};

	findDocuments(database, data, params, function(docs) {
		res.send(docs);
	});
});

app.get(path + '/test/removeAllUsers', function(req, res) {
	var data = {}
	removeDocument(database, data, function(docs) {
		res.send('All users deleted!');
	});
});

/* ------------ UTIL FUNCTIONS ------------- */

var insertDocument = function(db, data, callback) {
	var collection = db.collection(collectionUsed);

	collection.insert([data], function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var removeDocument = function(db, data, callback) {
	var collection = db.collection(collectionUsed);

	collection.remove(data, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var findDocuments = function(db, data, params, callback) {
	var collection = db.collection(collectionUsed);
	
	collection.find(data, params).toArray(function(err, docs) {
		assert.equal(err, null);
		callback(docs);
	});
}

var updateDocuments = function(db, params, data, callback) {
	var collection = db.collection(collectionUsed);

	collection.update(params, data, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var aggregate = function(db, params, callback) {
	var collection = db.collection(collectionUsed);

	collection.aggregate(params, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}
