var express = require('express');
var _ = require('lodash');
var app = express();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');
var geolib = require('geolib');
var Simplify = require("simplify-commerce");
var moment = require('moment');

app.use(bodyParser());
app.use(express.static('public'));

var mongoUrl = 'mongodb://localhost:3001/FYP',
	path = '/fyp',
	database,
	TEST_COLLECTION = 'TESTCOLLECTION',
	PROD_COLLECTION = 'production';

var DEV_MODE = true; //IF ON DEV PHASE
var collectionUsed = DEV_MODE ? TEST_COLLECTION : PROD_COLLECTION;
var transactionCollection = DEV_MODE ? 'test_transaction' : 'transaction';

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

	findDocuments(database, collectionUsed, data, params, function(docs) {
		res.send(docs);	
	});
});

app.post(path + '/updateUserInfo', function(req, res) {
	var fieldName = req.body.fieldName,
		fieldValue = req.body.fieldValue,
		params = { username: req.body.username },
		field = {};
	
	field[fieldName] = fieldValue;
	var data = {
		$set: field
	}; 

	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result);
	});
});

app.get(path + '/getUser', function(req, res) {
	var data = {
		username: req.query.username
	};
	
	var params = {
		username: true,
		email: true,
		name: true,
		address: true,
		stores: true
	};

	findDocuments(database, collectionUsed, data, params, function(docs) {
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

	aggregate(database, collectionUsed, params, function(docs) {
		res.send(docs);
	});
});

app.post(path + '/updateStoreDetails', function(req, res) {
	var params = {
		'stores.id': ObjectId(req.body.store_id)
	},
	storeObject = 'stores.$.',
	fieldValue = req.body.field_value,
	field = {};

	var fieldName = storeObject.concat(req.body.field_name); //concat field name
	field[fieldName] = fieldValue;
	var data = { 
		$set: field
	};

	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/deleteStore', function(req, res) {
	var storeId = ObjectId(req.body.store_id),
	params = {
		username: req.body.username,
		'stores.id': storeId
	},
	data = { 
		$pull: { 
			'stores' : {
				id: storeId
			}
		}
	};
	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result);
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

	aggregate(database, collectionUsed, params, function(docs) {
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
		date_joined: moment.now(),
		name: req.body.name,
		address: req.body.address,
		cart: {},
		stores: []
	};

	insertDocument(database, collectionUsed, data, function(result) {
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
					date_created: moment.now(),
					products: []
				} 
			}
		};
	updateDocuments(database, collectionUsed, params, data, function(result) {
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
				'date_created': moment.now(),
				'price': productData.price,
				'tags': productData.tags
			} 
		}
	};

	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/removeProduct', function(req, res) {
	var params = {
		'stores.id': ObjectId(req.body.store_id)
	},
	productId = req.body.product_id,
	data = { 
		$pull: { 
			'stores.$.products' : {
				'_id': productId
			}
		}
	};

	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result)
	});
});

app.post(path + '/addToCart', function(req, res) {
	var params = {
		'username': req.body.username
	};
	

	findDocuments(database, collectionUsed, params, { 'cart': true }, function(doc) {
		var productData = req.body.data,
			singleProduct = _.isString(productData.product_id),
			data = {};

		if(_.keys(doc[0].cart).length > 0) {
			if(singleProduct) {
				data = { 
					$addToSet: { 
						'cart.products' : {
							product_id: productData.product_id,
							quantity: productData.quantity
						}
					}
				}
			} else { 
				var multipleProducts = _.map(productData.product_id, function(id) { return {product_id: id, quantity: productData.quantity} });
				data = { 
					$addToSet: { 
						'cart.products' : {
							$each: multipleProducts
						}
					}
				}
			}

		} else {
			if(singleProduct) {
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
			} else {
				var multipleProducts = _.map(productData.product_id, function(id) { return {product_id: id, quantity: productData.quantity} });
				data = { 
					$set: { 
						'cart' : {
							store_id: productData.store_id,
							products: multipleProducts
						}
					}
				}
			}
		}
		console.log('DATA:', data);
		updateDocuments(database, collectionUsed, params, data, function(result) {
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
	
	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result)
	});
});

app.get(path + '/removeUser', function(req, res) {
	var data = {
		username: req.query.username
	};

	removeDocument(database, collectionUsed, data, function(result) {
		res.send(data.username + ' successfully removed!');
	});
});


/**
 * Gets Product details of products that are in the user's cart
 */
app.get(path + '/getCartData', function(req, res) {
	var data = { username: req.query.username };	
	var params = { cart: true };
	
	findDocuments(database, collectionUsed, data, params, function(docs) {
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

			aggregate(database, collectionUsed, params, function(details) {
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

	aggregate(database, collectionUsed, params, function(docs) {
		//returns false if no documents exist
		if(docs.length === 0) {
			res.send(false);
			return;
		}
		res.send(true);	
	});
});

app.get(path + '/productSuggestion', function(req, res) {
	var store_id = req.query.store_id,
		username = req.query.username;

		getUserTransactionHistory({ username: username, store_id: store_id }, function(transactions) {
			getStoreProducts(store_id, function(products) {
				tallyUserProductTags(transactions, products, function(error, tags) {
					if(error) {
						res.send('Product Suggestion not Available!');
					}
					if(tags) {
						var productSuggestion = [];
						var newProducts = _.sortBy(products, [function(o) { return o.date_created; }]).reverse().slice(0, 3);
						productSuggestion.push(_.shuffle(newProducts));
						productSuggestion.push([]);
						tags.forEach(function(tag) {
							var suggestedProductId = _.map(productSuggestion[1], '_id');
							var productSection = _.filter(products, function(product) { return _.includes(product.tags, tag.name) && !_.includes(suggestedProductId, product._id)}).slice(0, 3);
							productSuggestion[1] = productSuggestion[1].concat(_.shuffle(productSection));
						});

						res.send(productSuggestion);
					}
				});
			});
		});
});

/**
 *  Tally most popular product tags based on users previous transactions
 * @param {Object} transaction 
 * @param {Object} product 
 * @param {*} callback 
 */
var tallyUserProductTags = function(transactions, products, callback) {
	var tagCount = {};
	if(transactions.length < 1) {
		return callback('No products available!');
	}
	transactions.forEach(function(transaction) {
		transaction.products.forEach(function(product_id) {
			//find product object with the product id
			var productInTransaction = _.find(products, function(product) { return product._id == product_id });

			//tally tags in previous products bought
			productInTransaction.tags.forEach(function(tag) {
				var tagCountkeys = Object.keys(tagCount);
				//check if tag is already in tags object
				if(_.includes(tagCountkeys, tag)) {
					tagCount[tag] = tagCount[tag] + 1;
				} else {
					tagCount[tag] = 1;
				}
			}); 
		});
	});

	var transactionTags = [];
	for (var key in tagCount) {
		// check also if property is not inherited from prototype
		if (tagCount.hasOwnProperty(key)) { 
			var value = tagCount[key];
			transactionTags.push({ name: key, count: value});
		}
	}

	callback(null, _.sortBy(transactionTags, ['count']).reverse().slice(0, 3));
}

var getUserTransactionHistory = function(info, callback) {
	var data = { username: info.username };

	//if store_id is passed
	if (!_.isUndefined(info.store_id)) data.store_id = info.store_id; 

	findDocuments(database, transactionCollection, data, {}, function(result) {
		callback(result);
	});
}

var getStoreProducts = function(store_id, callback) {
	var params = [
		{ $unwind: '$stores' },
		{ $match: {'stores.id': ObjectId(store_id) } },
		{ $project: { 'products': '$stores.products' } }
	];

	aggregate(database, collectionUsed, params, function(doc) {
		callback(doc[0].products);
	})
}

app.post(path + '/pay', function(req, res) {
	var store_id = req.body.store_id;
		data = {
			username: req.body.username,
			store_id: req.body.store_id,
			amount: _.toString(req.body.amount),
			currency: req.body.currency,
			description: 'TEST',
			products: req.body.products,
			card: {
				number: req.body.card.number.replace(/ /g, ""),
				expMonth: req.body.card.expiration.slice(0, 2),
				expYear: req.body.card.expiration.slice(3, 5),
				cvc: _.toString(req.body.card.cvc)
			}
		};

	var params = [
		{ $unwind: '$stores' },
		{ $match: { 'stores.id': ObjectId(req.body.store_id) } },
		{ $project: { 'username': '$username', 'store_id': '$stores.id', 'paymentMethod': '$stores.paymentMethod' }}
	];
	aggregate(database, collectionUsed, params, function(doc) {
		var result = doc[0];

		if(result.paymentMethod.id == 'SIMPLIFY') {
			simplifyPayment(result.paymentMethod, data, function(error, result) {
				if(error) {
					res.send(error);
				}
				res.send(result);
			});
			
		} else if(result.paymentMethod.id == 'STRIPE') {
			stripePayment(result.paymentMethod, data, function(error, result) {
				if(error) {
					res.send(error);
				}
				res.send(result);
			});
		}
	});
	
});

var stripePayment = function(key, data, callback) {
	var stripe = require("stripe")(key.privateKey);

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
			source: token.id,
		},  function(err, charge) {
			if(err) {
				callback(error);
			}
			if(charge) {
				saveTransaction(data);
				removeFromCart(data.username, 'ALL');
				callback(null, charge);
			}
		});
	});
};

var simplifyPayment = function(key, data, callback) {
	var username = data.username;
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

	client.payment.create( transactionData, function(errData, successData) {
		if(errData) {
			callback(errData);
		}
		if(successData) {
			saveTransaction(data);
			removeFromCart(username, 'ALL');
			callback(null, successData);
		}
	})
};

var getStoreName = function(storeId, callback) {
	
	var params = [
		{ $unwind: '$stores' },
		{ $match: {'stores.id': ObjectId(storeId)} },
		{ $project: {'storeName': '$stores.name'} }
	];

	aggregate(database, collectionUsed, params, function(docs) {
		callback(docs);
	});
}

var saveTransaction = function(data) {
	var transactionData = {
		username: data.username,
		store_id: data.store_id,
		transaction_date: moment.now(),
		amount: data.amount,
		currency: data.currency,
		products: data.products
	}

	insertDocument(database, transactionCollection, transactionData, function(result) {
		console.log('Transaction saved!');
	});
}

app.post(path + '/removeFromCart', function(req, res) {
	var params = {
		'username': req.body.username
	},
	data = { 
		$pull: { 
			'cart.products': {
				'product_id': req.body.product_id 
			} 
		}
	};

	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result)
	});
});


var removeFromCart = function(username, data) {
	if(data == 'ALL') {
		var data = { 
				$set: { 
					cart: {}
				}
		};

		updateDocuments(database, collectionUsed, {username: username}, data, function(result) {
			console.log('Cart removed!');
		});
	}
};

app.get(path + '/getTransactionHistory', function(req, res) {
	var username = req.query.username;

	getUserTransactionHistory({username: username}, function(transactions) {
		transactions.forEach(function(transaction, index) {
			getStoreName(transaction.store_id, function(doc) {
				transactions[index].store_id = doc[0].storeName;
				if(index == transactions.length - 1) {
					res.send(transactions.reverse()); //newest transaction first
				}
			})
		})
	})
});

/* ------------ TEST CODE -------------------- */

app.get(path + '/test/testData', function(req, res) {
	var fs = require("fs");
	var userData = JSON.parse(fs.readFileSync("testData/userData.json"));
	var transactionData = JSON.parse(fs.readFileSync("testData/transactionData.json"));
	
	insertDocument(database, collectionUsed, userData, function(userDoc) {
		insertDocument(database, transactionCollection, transactionData, function(transactionDoc) {
			res.send('Test Data populated!');
		});
	});
});

app.get(path + '/test/deleteStoreByName', function(req, res) {
	var storeName = req.query.store_name,
	params = {
		username: req.query.username,
		'stores.name': storeName
	},
	data = { 
		$pull: { 
			'stores' : {
				name: storeName
			}
		}
	};
	updateDocuments(database, collectionUsed, params, data, function(result) {
		res.send(result.result);
	});
});

app.get(path + '/test/insertTestUser', function(req, res) {
	var testUser = {
		username: 'test',
		email: 'test@test.com',
		password: 'test',
		date_joined: moment.now(),
		name: 'Test Test',
		address: '25 test St., Test',
		cart: {},
		stores: [
			{
				id: ObjectId(),
				name: 'Store 1',
				description: 'Store 1',
				address: '24 millstead',
				date_created: moment.now(),
				location: {
					latitude: 53.35487382895707,
   					longitude: -6.279025369998967
				},
				paymentMethod: {
					id: 'STRIPE',
					privateKey: 'sk_test_nDM3e0g8GR0a7xcnTvVB0DOf'
				},
				products: []
			},
			{
				id: ObjectId(),
				name: 'Store 2',
				description: 'Most awesome store!',
				address: '25 millstead',
				date_created: moment.now(),
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

	insertDocument(database, collectionUsed, testUser, function(result) {
		res.send('Test user Added!');
	});
});

app.get(path + '/test/removeTestUser', function(req, res) {
	var testUser = {username: 'test', password: 'test'};

	removeDocument(database, collectionUsed, testUser, function(result) {
		res.send(result);
	});

});

app.get(path + '/test/find', function(req, res) {
	var data = {},
		params = {
			password: false
		};

	findDocuments(database, collectionUsed, data, params, function(docs) {
		res.send(docs);
	});
});

app.get(path + '/test/transactions', function(req, res) {
	var data = {},
		params = {};
	
	if(!_.isUndefined(req.body.store_id)) data.store_id = req.body.store_id;

	findDocuments(database, transactionCollection, data, params, function(docs) {
		res.send(docs);
	});
});


app.get(path + '/test/removeAllUsers', function(req, res) {
	var data = {}
	removeDocument(database, collectionUsed, data, function(docs) {
		res.send('All users deleted!');
	});
});

app.get(path + '/test/clearTransactions', function(req, res) {
	var data = {}
	removeDocument(database, transactionCollection, data, function(docs) {
		res.send('transactions deleted!');
	});
});

/* ------------ UTIL FUNCTIONS ------------- */

var insertDocument = function(db, collection, data, callback) {
	var col = db.collection(collection);
	col.insert(data, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var removeDocument = function(db, collection, data, callback) {
	var col = db.collection(collection);

	col.remove(data, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var findDocuments = function(db, collection, data, params, callback) {
	var col = db.collection(collection);
	
	col.find(data, params).toArray(function(err, docs) {
		assert.equal(err, null);
		callback(docs);
	});
}

var updateDocuments = function(db, collection, params, data, callback) {
	var col = db.collection(collection);

	col.update(params, data, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var aggregate = function(db, collection, params, callback) {
	var col = db.collection(collection);

	col.aggregate(params, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}
