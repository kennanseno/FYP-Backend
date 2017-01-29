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
	var config = req.query.queryParams,
            data = {};
	
	if(_.isString(req.query.username)) data.username = req.query.username;
	if(_.isString(req.query.password)) data.password = req.query.password;

	//returns only requested data
	var params = {};
	if(_.isString(config)) {
		params[config] = true;
	} else if(_.isObject(config)) {
		for(var index = 0; index < config.length; index++){
			params[config[index]] = true;
		}

	}

	findDocuments(database, data, params, function(docs) {
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
			$push: { 'stores.product' : req.body.data }
		};
	
	console.log('Data: ', data)
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
