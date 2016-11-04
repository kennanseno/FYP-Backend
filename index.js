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








/*
		TEST CODES
*/

app.get(path + '/test/insertTestUser', function(req, res) {
	var testUser = {username: 'test', password: 'test'};

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
	findDocuments(database, function(docs) {
		res.send(docs);
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
		//assert.equal(err, null);
		callback(result);
	});
}

var findDocuments = function(db, callback) {
	var collection = db.collection(collectionUsed);
	
	collection.find({}).toArray(function(err, docs) {
		assert.equal(err, null);
		callback(docs);
	});
}
