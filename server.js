/*
 * Author: @chasehult
 */

const express = require('express');
const parser = require('body-parser');
const http = require("http");
const https = require("https");
const fs = require('fs');

const app = express();
app.use(parser.json());
app.use(parser.urlencoded({extended: true})); 

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

app.use(express.static('data'));

// Start Server
http.createServer(app).listen(8002, () => console.log(`HTTP listening at port 8002`));

https.globalAgent.options.ca = require('ssl-root-cas').create();
certs = require('./certs.json');
https.createServer({
  key: fs.readFileSync(certs['key']),
  cert: fs.readFileSync(certs['cert'])
}, app).listen(443, () => console.log(`HTTPS listening at port 443`));