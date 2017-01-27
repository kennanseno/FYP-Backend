var express = require('express');
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

//IF ON DEV MODE
var DEV_MODE = true;
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
		data = {
			username: req.query.username,
			password: req.query.password
	};

	//returns only requested data
	var params = {};
	if(config) {
		for(var index = 0; index < config.length; index++){
			params[config[index]] = true;
		}

	}


	console.log('params: ', params);
	findDocuments(database, data, params, function(docs) {
		res.send(docs);
		console.log(docs);	
	});
});

app.get(path + '/registerUser', function(req, res) {
	var data = {
		username: req.query.username,
		email: req.query.email,
		password: req.query.password,
		name: req.query.name,
		address: req.query.address
	};

	insertDocument(database, data, function(result) {
		console.log('New User added!');
		res.send(result.result);
	});
});

/*
		TEST CODES
*/

app.get(path + '/test/insertTestUser', function(req, res) {
	var testUser = {
		username: 'test',
		email: 'test@test.com',
		password: 'test',
		name: 'Test Test',
		address: '25 test St., Test',
		stores: [
			'Store 1',
			'Store 2'
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


/* 
	UTIL FUNCTIONS
*/


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

var findDocuments = function(db, data, config, callback) {
	var collection = db.collection(collectionUsed);
	
	collection.find(data, config).toArray(function(err, docs) {
		assert.equal(err, null);
		console.log(docs.length + ' Documents found!');
		callback(docs);
	});
}
