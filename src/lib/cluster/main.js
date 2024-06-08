require('dotenv').config();
const log = require("../logger");
const {sequelize, connect} = require("../database/db");
const workerStates  = require("../helpers/workerStates");

//let's get the channels from the DB... we will use this to fork the workers
const Users = require('../database/models/user');
const Messages = require("../database/models/messages");
const Settings = require("../database/models/settings");
const Hastags = require("../database/models/hashtags");
const Gamble = require("../database/models/gamble");
const FishCaught = require("../database/models/fishCaught");

module.exports = class Main {
    //private - we use this to get the channels from the DB
    #users = null;
    #twitchChannels = [];
    workers = [];
    restartCounts = {};
    workerToChannelIndexMap = {};
    workerState = workerStates.STARTING;
    cluster = null;

    constructor(cluster){
        log.info(`Master ${process.pid} is running`, {service: "Cluster", pid: process.pid, channel: "Main"});
        this.cluster = cluster;
        this.signalHandler();
    }

    async init(){
        return new Promise(async (resolve) => {
            //let's do this in a try block.
            try {
                //let's deal with the database initialization.
                await connect().then(async () => {
                    log.info('Database connected successfully', {
                        service: "DB",
                        pid: process.pid,
                        channel: "Main"
                    });

                    await Messages.sync({alter: false}).then(() => {
                        log.info('Messages Table Synchronised Successfully', {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });

                    await Settings.sync({alter: false}).then(() => {
                        log.info('Settings Table Synchronised Successfully', {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });

                    await FishCaught.sync({alter: false}).then(() => {
                        log.info('FishCaught Table Synchronised Successfully', {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });

                    await Users.sync({alter: false}).then(() => {
                        log.info('Users Table Synchronised Successfully', {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });

                    await Hastags.sync({alter: false}).then(() => {
                        log.info('Hashtags Table Synchronised Successfully', {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });

                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });

                    await Gamble.sync({alter: false}).then(() => {
                        log.info('Gamble Table Synchronised Successfully', {service: "DB", pid: process.pid});
                    }).catch((e) => {
                        log.error(e, {
                            service: "DB",
                            pid: process.pid,
                            channel: "Main"
                        });
                    });
                    resolve(true);
                });
            } catch (e) {
                log.error(e, {
                    service: "DB",
                    pid: process.pid,
                    channel: "Main"
                });
                this.workerState = workerStates.DEAD;
                /* exit the process */
                process.exit(1);
            }
        });
    }

    async start(){
        return new Promise(async (resolve, reject) => {
           try{
               //let's do the initialization first.
                await this.init();

               //update the channels
               await this.updateChannels();

               //check if there are any channels to fork.
               if(this.#twitchChannels.length <= 0){
                   log.warn(`No enabled channels found in the DB`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                   await this.stop();
               }

                //fork the workers
                await this.forkWorkers();

               //change the state to running
                this.workerState = workerStates.RUNNING;
           } catch(e) {
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: "Main"});
                await this.stop();
                reject(e);
           }
        });
    }

    async stop(){
        log.info(`Main received Signal to Quit`, {service: "Cluster", pid: process.pid, channel: "Main"});
        this.workerState = workerStates.STOPPING;

        //before we kill the main DB connection, let's kill all the workers.
        for (const worker of Object.values(this.cluster.workers)) {
            if(worker.pid === process.pid) continue;
            if(worker.isDead()) continue;
            await this.workerKill(worker)
        }

        //close out of the db connection
        await sequelize.close().then(() => log.info('DB connection closed', {service: "DB", pid: process.pid, channel: "Main"})).catch((e) => log.error(e, {service: "DB", pid: process.pid, channel: "Main"}));

        setTimeout(() => {
            log.info('Completing shutdown after 2 seconds', {service: "Cluster", pid: process.pid, channel: "Main"});
            process.exit(0);
        }, 2000);
    }

    async restart(){
        return new Promise(async (resolve, reject) => {
            try{
                //change the state to restarting
                this.workerState = workerStates.RESTARTING;

                //update the channels
                await this.updateChannels();

                //check if there are any channels to fork.
                if(this.#twitchChannels.length <= 0){
                    log.warn(`No enabled channels found in the DB`, {service: "Twitch Manager", pid: process.pid, channel: "Main"});
                    await this.stop();
                }

                //fork the workers
                await this.forkWorkers();

                //change the state to running
                this.workerState = workerStates.RUNNING;
                resolve(true);
            }catch(e){
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel:  "Main"});
                await this.stop();
                reject(e);
            }
        });
    }

    async restartWorkers(){
        return new Promise(async (resolve, reject) => {
            try{
                // Reset the restart count
                this.restartCounts = {}
                // reset the worker array
                this.workers = [];
                //reset the worker to channel index map
                this.workerToChannelIndexMap = {};

                // Fork workers.
                await this.forkWorkers();
                resolve(true);
            } catch (e) {
                log.error(e, {
                    service: "Cluster Manager",
                    pid: process.pid,
                    channel: "Main"
                });
                reject(e);
            }
        });
    }

    async workerKill(worker){
        return new Promise(async (resolve, reject) => {
            try{
                this.workers.splice(this.workers.indexOf(worker), 1);

                resolve(true);
            }catch(e){
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: "Main"});
                reject(e);
            }
        });
    }

    async workerRestart(worker){
        return new Promise(async (resolve, reject) => {
            try {
                const channels = this.workerToChannelIndexMap[worker.id];
                log.warn(`Restarting worker for channels: ${channels.join(", ")}`, {service: "Cluster", pid: process.pid, channel: "Main"});
                // Shutdown old worker
                await this.workerKill(worker);
                // Fork a new worker with the same channels
                const newWorker = this.cluster.fork({ channels: channels });
                this.workers.push(newWorker);
                this.workerToChannelIndexMap[newWorker.id] = channels; // Update mapping with new worker ID
                resolve(true);
            } catch (e) {
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: "Main"});
                reject(e);
            }
        });
    }

    signalHandler(){
        this.cluster.on('exit',
            (worker, code, signal) =>
                this.workerExit(worker, code, signal).catch((e) => log.error(e, {service: "Cluster Manager", pid: process.pid, channel: "Main"})));

        this.cluster.on('message',
            (worker, message, handle) =>
                this.messageHandler(worker, message, handle).catch((e) => log.error(e, {service: "Cluster Manager", pid: process.pid, channel: "Main"})));

        process.on('SIGINT', this.stop);
        process.on('SIGTERM', this.stop);
    }

    async workerExit(worker, code){
        return new Promise(async (resolve, reject) => {
            try {
                //this means that the main thread was dead before the worker.
                if(!this.workerState) return resolve(true);

                //let's check if the main thread is stopping.
                if (this.workerState === workerStates.STOPPING){
                    log.info(`Worker for channel index ${channelIndex} (${this.#twitchChannels[channelIndex]}) has been shutdown`, {
                        service: "Cluster",
                        pid: process.pid,
                        channel: (process.env.channels) ? process.env.channels : "Main"
                    });
                    await this.workerKill(worker);
                    return resolve(true);
                }

                //get the channel index
                const channelIndex = this.workerToChannelIndexMap[worker.id]; // Retrieve channel index

                // Let's check the code being sent.
                switch (code) {
                    case 450001: //forced restart.
                        //we don't need to increase the counter.
                        log.info(`Worker for channel index ${channelIndex} (${this.#twitchChannels[channelIndex]}) has exited with code ${code} however, it was necessary for a reboot due to change.`, {
                            service: "Cluster",
                            pid: process.pid,
                            channel: (process.env.channel) ? process.env.channel : "Main"
                        });
                        break;
                    case 450002: //shutdown
                        log.info(`Worker for channel index ${channelIndex} (${this.#twitchChannels[channelIndex]}) has been shutdown`, {
                            service: "Cluster",
                            pid: process.pid,
                            channel: (process.env.channel) ? process.env.channel : "Main"
                        });
                        await this.workerKill(worker);
                        return resolve(true);
                    default: //unknown restart.
                        this.restartCounts[channelIndex] += 1;
                        log.info(`Worker for channel index ${channelIndex} (${this.#twitchChannels[channelIndex]}) has been restarted ${this.restartCounts[channelIndex]} times`, {
                            service: "Cluster",
                            pid: process.pid,
                            channel: (process.env.channel) ? process.env.channel : "Main"
                        });
                }

                if (this.restartCounts[channelIndex] > 3) {
                    log.error(`Worker for channel index ${channelIndex} (${this.#twitchChannels[channelIndex]}) has hit the max restart count and will not be restarted`, {
                        service: "Cluster",
                        pid: process.pid,
                        channel: (process.env.channel) ? process.env.channel : "Main"
                    });
                    await this.workerKill(worker);
                    return resolve(true);
                }

                //restart the worker
                await this.workerRestart(channelIndex);
                resolve(true);
            } catch (e) {
                log.error(e, {
                    service: "Cluster Manager",
                    pid: process.pid,
                    channel: (process.env.channel) ? process.env.channel : "Main"
                });
                reject(e);
            }
        });
    }

    async updateChannels() {
        return new Promise(async (resolve, reject) => {
            //add try catch block
            try {
                // Fetch new channels from the database or other source
                // Update twitchChannels array

                //clear the current array
                this.#twitchChannels = [];
                this.#users = await Users.findAll({raw: true});

                //update the channels
                if (this.#users.length === 0) {
                    log.warn(`No channels found in the DB`, {
                        service: "Twitch Manager",
                        pid: process.pid,
                        channel: (process.env.channel) ? process.env.channel : "Main"
                    });
                    //use these channels from the env
                    this.#twitchChannels = process.env.TMI_CHANNELS.split(',');
                } else {
                    //let's build the array of channels, we will only fork workers for channels that are enabled.
                    this.#users.forEach((user) => {
                        if (user.isEnabled)
                            this.#twitchChannels.push(user.login);
                    });
                }
                resolve(true);
            } catch (e) {
                log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel) ? process.env.channel : "Main"});
                reject(e);
            }
        });
    }

    async forkWorkers(){
        return new Promise(async (resolve, reject) => {
            try {
                const numWorkers = process.env.APP_FORK_LIMIT || 5; // Maximum number of workers
                const channelsPerWorker = Math.ceil(this.#twitchChannels.length / numWorkers);
                this.workers = [];
                this.workerToChannelIndexMap = {}; // Reset the mapping

                for (let i = 0; i < numWorkers; i++) {
                    // Distribute channels evenly across workers
                    const workerChannels = this.#twitchChannels.slice(i * channelsPerWorker, (i + 1) * channelsPerWorker);
                    if (workerChannels.length > 0) {
                        const worker = this.cluster.fork({ channels: workerChannels });
                        this.workers.push(worker);
                        this.restartCounts[worker.id] = 0; // Initialize restart count for this worker
                        this.workerToChannelIndexMap[worker.id] = workerChannels; // Map worker ID to its list of channels
                        //worker.on('message', (msg) => this.handleWorkerMessage(worker, msg));
                    }
                }
                log.info(`Forked ${this.workers.length} workers`, {service: "Cluster", pid: process.pid, channel: (process.env.channel) ? process.env.channel : "Main"});
                resolve(true);
            } catch (e) {
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: (process.env.channel) ? process.env.channel : "Main"});
                reject(e);
            }
        });
    }

    async messageHandler(worker, message){
        return new Promise(async (resolve, reject) => {
            try{
                if (message.type === 'updateChannels') {
                    // Logic to update channels
                    await this.updateChannels();
                    // Optionally, you can also handle restarting workers here
                    await this.restartWorkers();
                }
                resolve(true);
            }catch(e){
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: (process.env.channel) ? process.env.channel : "Main"});
                reject(e);
            }
        });
    }
}