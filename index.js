'use strict';

const mongoose = require("mongoose");
const multer = require("multer");
const GridFsStorage = require("multer-gridfs-storage");

const config = require('./config');
const helpers = require('./helpers');

// facebook page access token
const PAGE_ACCESS_TOKEN = config.PAGE_ACCESS_TOKEN;

// Setup global users' conversation state management
global.users = [];

// Imports dependencies and set up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express().use(bodyParser.json()); // creates express http server

// database uri
const mongoURI = config.DB_URL;

// database connection
const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// init gfs
let gfs;
conn.once("open", () => {
  // init stream
  gfs = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "uploads"
  });
});

// Storage
const storage = new GridFsStorage({
	  url: mongoURI,
	  file: (req, file) => {
	    return new Promise((resolve, reject) => {
	        const fileInfo = {
	          filename: file.originalname,
	          bucketName: "uploads"
	        };
	        resolve(fileInfo);
	    });
	  }
});
const upload = multer({
	storage
});

app.post('/upload', upload.single('file'), (req, res) => {
	res.status(200).send('UPLOADED FILE');
});

app.get('/audio/:filename', (req, res) => {
	const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Your verify token. Should be a random string.
  let VERIFY_TOKEN = config.SECRET_TOKEN;
    
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
  
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {

	let body = req.body;

	// Checks this is an event from a page subscription
	if (body.object === 'page') {

		// Iterates over each entry - there may be multiple if batched
		body.entry.forEach(function(entry) {

		  // Gets the message. entry.messaging is an array, but 
		  // will only ever contain one message, so we get index 0
		  let webhook_event = entry.messaging[0];
		  console.log(webhook_event);

		  let sender_psid = webhook_event.sender.id;
		  console.log('Sender PSID: ' + sender_psid);

		  // Create new user if havent
		  if(!global.users[sender_psid]) {
		  	console.log("[DEBUG] User does not exist!");
		  	global.users[sender_psid] = {'currentState': 'initial'};
		  }

		  // Check if the event is a message or postback and
		  // pass the event to the appropriate handler function
		  if (webhook_event.message) {
		    helpers.handleMessage(sender_psid, webhook_event.message);  
		  } else if (webhook_event.postback) {
		    helpers.handlePostback(sender_psid, webhook_event.postback);
		  }
		});

		// Returns a '200 OK' response to all requests
		res.status(200).send('EVENT_RECEIVED');
	} else {
		// Returns a '404 Not Found' if event is not from a page subscription
		res.sendStatus(404);
	}
});

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));