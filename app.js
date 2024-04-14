const startTime = Date.now(); //keep track of running time...
require('dotenv').config();
const log = require('./src/lib/logger');
const cluster = require('cluster');
const Main = require('./src/lib/cluster/main');
const twitchWorker = require('./src/lib/cluster/twitchWorker');

const os= require("os");
const path = require('path');
const tmi = require('tmi.js');
const express = require('express');
const { Sequelize, sequelize, connect } = require('./src/lib/database/db');
const { Op } = require('sequelize');
const Settings = require("./src/lib/database/models/settings");
const Messages = require("./src/lib/database/models/messages");
const Users = require("./src/lib/database/models/user");
const Hastags = require("./src/lib/database/models/hashtags");
const Gamble = require("./src/lib/database/models/gamble");


if(process.env.test_build === "true"){
    log.debug('This is a test build', {service: "Main", pid: process.pid});
    process.exit(0);
}

/* let's do the db connection first then we can start the app  */
if (cluster.isMaster) {
    const main = new Main(cluster);
    main.start();
}else{
    const worker = new twitchWorker(cluster);
    worker.start();
}

module.exports = {
    startTime
}