var express = require('express');
var _ = require('lodash');
var app = express();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var geolib = require('geolib');

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
		{ $match: {'username': req.query.username} },
		{ $unwind: '$stores' },
		{ $match: {'stores.name': req.query.storename} },
		{ $project: {'products': '$stores.products', 'paymentMethod': '$stores.paymentMethod._id'} }
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
			'name': '$stores.name', 
			'description': 
			'$stores.description', 
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
		cart: [],
		stores: []
	};

	insertDocument(database, data, function(result) {
		console.log('New User added!');
		res.send(result.result);
	});
});

app.post(path + '/createStore', function(req, res) {
	req.body.data.products = []; // inject empty product array
	var params = req.body.params,
		data = { 
			$push: { stores: req.body.data }
		};
	
	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/addProduct', function(req, res) {
	var params = req.body.params,
		data = { 
			$push: { 'stores.$.products' : req.body.data }
		};

	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/addToCart', function(req, res) {
	var params = req.body.params,
		data = { 
			$push: { 'cart' : req.body.data }
		};

	updateDocuments(database, params, data, function(result) {
		res.send(result.result)
	});
});


app.post(path + '/addPaymentMethod', function(req, res) {
	var params = req.body.params,
	data = { 
		$set: { 'stores.$.paymentMethod' : req.body.data }
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
		var products = docs[0].cart;
		var result= [];

		//TODO: use $in operator instead
		products.forEach(function(object, index) {
			var params = [
				{ $match: {'username': object.store_owner} },
				{ $unwind: '$stores' },
				{ $match: {'stores.name': object.store_name} },
				{ $project: { 'products': '$stores.products' } },
				{ $unwind: '$products' },
				{ $match: {'products._id': object.product_id } }
			];

			aggregate(database, params, function(details) {
				details[0].products.quantity = object.quantity; //inject quantity of each product in cart. FIND BETTER SOLUTION!
				result.push(details[0].products);
				if (index === products.length - 1) {
					res.send(result);
				}
			});

		});		
	});
});

app.get(path + '/productExists', function(req, res) {
	var params = [
		{ $match: {'username': req.query.store_owner} },
		{ $unwind: '$stores' },
		{ $match: {'stores.name': req.query.store_name} },
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

/* ------------ TEST CODE -------------------- */

app.get(path + '/test/insertTestUser', function(req, res) {
	var testUser = {
		username: 'test',
		email: 'test@test.com',
		password: 'test',
		name: 'Test Test',
		address: '25 test St., Test',
		cart: [],
		stores: [
			{
				name: 'Store 1',
				description: 'Most awesome store!',
				address: '25 millstead',
				location: {
					    latitude: 53.35487382895707,
    					longitude: -6.279025369998967
				},
				paymentMethod: 
					{
						_id: 'SIMPLIFY',
						publicKey: 'sbpb_MmVmOGUyNDgtNThjYy00MTZhLWI4YTMtNTIzMDVkZGE5Mjlh'
					}
				,
				products: [
					{
						"description": "test",
						"name": "testProduct",
						"_id": "8710624215682",
						"price": 13
					},
					{
						"description": "test",
						"name": "Product 2",
						"_id": "9710624215682",
						"price": 11
					}
				]
			},
			{
				name: 'Store 2',
				description: 'Most awesome store!',
				address: '25 millstead',
				location: {
					latitude: 53.33785738724761,
					longitude: -6.267085527951536
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
		console.log('All users deleted!');
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
		console.log(docs.length + ' Documents found!');
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
