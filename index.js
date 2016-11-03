var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

app.use(bodyParser());
app.use(express.static('public'));

var url = 'mongodb://localhost:3001/FYP';
var database;

MongoClient.connect(url, function(err, db) {
	if(err) {
		return console.log(err);
	}

	database = db;
	app.listen(3000, function() {
		console.log('Application listening on Port 3000');
	});
});

app.get('/test', function(req, res) {
	console.log('HELLO');
	var collection = database.collection('testCollection');

	collection.find({}).toArray(function(error, documents) {
		if(error) throw error;

		res.send(documents);
	});
});


var insertDocuments = function(db, callback) {
	var collection = db.collection('testCollection');

	collection.insertMany([
		{a: 1}, {a : 2}, {a: 3}
	], function(err, result) {
		assert.equal(err, null);
		assert.equal(3, result.result.n);
		assert.equal(3, result.ops.length);
		console.log("Inserted 3 documents into the document collection");
		callback(result);
	});
}

var findDocuments = function(db, callback) {
	var collection = db.collection('testCollection');
	
	collection.find({}).toArray(function(err, docs) {
		assert.equal(err, null);
		console.log("Found the following records");
		console.dir(docs);
		callback(docs);
	});
}
