require('dotenv').config();
const path = require("path");
const tmi = require("tmi.js");
const log = require("../logger");
const {sequelize, connect} = require("../database/db");
const workerStates  = require("../helpers/workerStates");
const { loadCommands } = require("../commandHandler");
const twitchMessage = require("../twitchMessage");

//let's get the channels from the DB... we will use this to fork the workers
const Users = require('../database/models/user');
const Messages = require("../database/models/messages");
const Settings = require("../database/models/settings");
const Hastags = require("../database/models/hashtags");
const Gamble = require("../database/models/gamble");

module.exports = class TwitchWorker {
    cluster = null;
    client = null;
    workerState = workerStates.STARTING;
    userCooldown = new Map();
    #channels = [];
    #prefixes = new Map();

    constructor(cluster){
        log.info(`Slave ${process.pid} is running`, {service: "Cluster", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
        this.cluster = cluster;
        this.#channels = process.env.channels;

        this.signalHandler();
    }

    async init(){
        return new Promise(async (resolve, reject) => {
            //let's do this in a try block.
            try {
                //let's deal with the database initialization.
                await connect().then(async () => {
                    log.info('DB connection established', {service: "DB", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                    resolve(true);
                });

                await loadCommands(path.join(__dirname, '/../../commands')).catch((e) => log.error(e,{service: "Command Handler", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"}));

                //for each of the channels we will need to check the prefixes
                for (const channel of this.#channels.split(',')) {
                    const settings = await Settings.findOne({where: {key:"prefix", channeluserid: channel}, raw: true});
                    if(settings) this.#prefixes[channel] = settings.value;
                    else this.#prefixes[channel] = process.env.TMI_COMMAND_PREFIX;
                }

                log.info(`Channel Prefixes: ${JSON.stringify(this.#prefixes)}`, {service: "Twitch Worker", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});

            } catch (e) {
                log.error(e, {
                    service: "Twitch Worker",
                    pid: process.pid,
                    channel: (process.env.channels) ? process.env.channels : "Main"
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

                this.client = await new tmi.Client({
                    options: {
                        debug: process.env.TMI_DEBUG === 'true',
                        messageLogLevel: process.env.TMI_DEBUG === 'true' ? 'info' : 'error'
                    },
                    identity: {
                        username: process.env.TMI_USER,
                        password: process.env.TMI_PASS
                    },
                    connection: {
                        secure: true,
                        reconnect: true
                    },
                    channels: [this.#channels]
                });

                this.client.on('connected', (addr, port) => {
                    log.info(`Connected to ${addr}:${port}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                });

                this.client.on('connecting', (addr, port) => {
                    log.info(`Connecting to ${addr}:${port}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                });

                this.client.on('disconnected', (reason) => {
                    log.warning(`Disconnected: ${reason}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                });

                this.client.on('logon', () => {
                    log.info(`Logged in, Ready to rock`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                });

                this.client.on('message', async (channel, userstate, message, self) => {
                   //define a new message object
                   const msg = new twitchMessage(this.client, channel, userstate, message, self, this.#prefixes[channel.slice(1)], this.userCooldown);
                   await msg.handleMessage();
                });

                //connect the client
                await this.client.connect()
                    .catch(e => { log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"}) });

                //change the state to running
                this.workerState = workerStates.RUNNING;
            } catch(e) {
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: (process.env.channels) ? process.env.channels : "Main"});
                await this.stop();
                reject(e);
            }
        });
    }

    async signalHandler(){
        process.on('SIGINT', this.stop);
        process.on('SIGTERM', this.stop);
    }

    async stop(){
        log.info(`Worker received Signal to Quit`, {service: "Cluster", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
        this.workerState = workerStates.STOPPING;

        //close out of the db connection
        await sequelize.close().then(() => log.info('DB connection closed', {service: "DB", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"})).catch((e) => log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"}));

        process.exit(0);
    }

    async restart(){
        return new Promise(async (resolve, reject) => {
            try{
                //change the state to restarting
                this.workerState = workerStates.RESTARTING;

                //change the state to running
                this.workerState = workerStates.RUNNING;
                resolve(true);
            }catch(e){
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: (process.env.channel) ? process.env.channel : "Main"});
                await this.stop();
                reject(e);
            }
        });
    }
}



