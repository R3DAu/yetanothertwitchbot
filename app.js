const startTime = Date.now(); //keep track of running time...
require('dotenv').config();
const log = require('./src/lib/logger');
const cluster = require('cluster');
const Main = require('./src/lib/cluster/main');
const TwitchWorker = require('./src/lib/cluster/twitchWorker');

if(process.env.test_build === "true"){
    log.debug('This is a test build', {service: "Main", pid: process.pid});
    process.exit(0);
}

/* let's do the db connection first then we can start the app  */
if (cluster.isMaster) {
    const main = new Main(cluster);
    main.start().then(() => {
        log.info('Main process is running', {service: "Main", pid: process.pid});
    });
}else{
    const worker = new TwitchWorker(cluster);
    worker.start().then(() => {
        log.info(`Twitch worker ${process.pid} is running`, {service: "Twitch Worker", pid: process.pid});
    });
}

module.exports = {
    startTime
}