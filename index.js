var express = require('express');
var _ = require('lodash');
var app = express();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

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

app.get(path + '/getProducts', function(req, res) {
	var params = [
		{ $match: {'username': req.query.username} },
		{ $unwind: '$stores' },
		{ $match: {'stores.name': req.query.storename} },
		{ $project: {'products': '$stores.products'} }
	];

	aggregate(database, params, function(docs) {
		res.send(docs);	
	});
});


app.get(path + '/registerUser', function(req, res) {
	var data = {
		username: req.query.username,
		email: req.query.email,
		password: req.query.password,
		name: req.query.name,
		address: req.query.address,
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

app.get(path + '/removeUser', function(req, res) {
	var data = {
		username: req.query.username
	};

	removeDocument(database, data, function(result) {
		res.send(data.username + ' successfully removed!');
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
		stores: [
			{
				name: 'Store 1',
				description: 'Most awesome store!',
				address: '25 millstead',
				paymentMethod: 
					{
						_id: 'SIMPLIFY',
						publicKey: 'sbpb_MmVmOGUyNDgtNThjYy00MTZhLWI4YTMtNTIzMDVkZGE5Mjlh',
						privateKey: 'Tw5A8JfQwsAk8b8KrohVCeBNLEWQR2QO4eq6AudJx295YFFQL0ODSXAOkNtXTToq' 
					}
				,
				products: []
			},
			{
				name: 'Store 2',
				description: 'Most awesome store!',
				address: '25 millstead',
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
