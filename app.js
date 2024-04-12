const startTime = Date.now(); //keep track of running time...
require('dotenv').config();
const os= require("os");
const log = require('./src/lib/logger');
const cluster = require('cluster');
const path = require('path');
const tmi = require('tmi.js');
const {loadCommands, hasCommand, getCommand} = require("./src/lib/commandHandler");
const express = require('express');
const { Sequelize, sequelize, connect } = require('./src/lib/database/db');
const { Op } = require('sequelize');
const Settings = require("./src/lib/database/models/settings");
const Messages = require("./src/lib/database/models/messages");
const Users = require("./src/lib/database/models/user");
const Hastags = require("./src/lib/database/models/hashtags");
const Gamble = require("./src/lib/database/models/gamble");

let isShuttingDown = false;

if(process.env.test_build === "true"){
    log.debug('This is a test build', {service: "Main", pid: process.pid});
    process.exit(0);
}

/* let's do the db connection first then we can start the app  */
(async () => {
    try{
        await connect().then(async () => {
            log.info('Database connected successfully', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

            await Messages.sync({alter: false}).then(() => {
                log.info('Messages Table Synchronised Successfully', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }).catch((e) => {
                log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            });

            await Settings.sync({alter: false}).then(() => {
                log.info('Settings Table Synchronised Successfully', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }).catch((e) => {
                log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            });

            await Users.sync({alter: false}).then(() => {
                log.info('Users Table Synchronised Successfully', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }).catch((e) => {
                log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            });

            await Hastags.sync({alter: false}).then(() => {
                log.info('Hashtags Table Synchronised Successfully', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }).catch((e) => {
                log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            });

            await Gamble.sync({alter: false}).then(() => {
                log.info('Gamble Table Synchronised Successfully', {service: "DB", pid: process.pid});
            }).catch((e) => {
                log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            });
        });
    }catch(e){
        log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        /* exit the process */
        process.exit(1);
    }

    if (cluster.isMaster) {
        log.info(`Master ${process.pid} is running`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        let twitchChannels = [];

        //let's get the channels from the DB... we will use this to fork the workers
        const Users = require('./src/lib/database/models/user');
        let users = await Users.findAll({raw: true});
        let workers = [];
        let restartCounts = {};
        let workerToChannelIndexMap = {};

        if(users.length === 0){
            log.warn(`No channels found in the DB`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            //use these channels from the env
            twitchChannels = process.env.TMI_CHANNELS.split(',');
        }else{
            //let's build the array of channels, we will only fork workers for channels that are enabled.
            users.forEach((user) => {
                if(user.isEnabled)
                    twitchChannels.push(user.login);
            });
        }

        if(twitchChannels.length <= 0){
            log.warn(`No enabled channels found in the DB`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            gracefulShutdown();
        }

        // Fork workers.
        for (let i = 0; i < twitchChannels.length; i++) {
            // Fork a worker for each channel
            const worker = cluster.fork({channel: twitchChannels[i]});
            // Keep track of the worker
            workers.push(worker);
            restartCounts[i] = 0; // Use channel index as the identifier
            workerToChannelIndexMap[worker.id] = i; // Map worker ID back to channel index
        }

        cluster.on('exit', (worker, code, signal) => {
            log.warn(`worker ${worker.process.pid} died`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

            //get the channel index
            const channelIndex = workerToChannelIndexMap[worker.id]; // Retrieve channel index

            // Check if the worker is being restarted due to a shutdown
            if(isShuttingDown){
                workers.splice(workers.indexOf(worker), 1);
                if(workers.length === 0){
                    log.warn(`All workers have been shutdown`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                    process.exit(0);
                }
                return;
            }

            //we will stop and remove the work if we get a 450002 code
            if(code === 450002){
                workers.splice(workers.indexOf(worker), 1);
                log.info(`Worker for channel index ${channelIndex} (${twitchChannels[channelIndex]}) has been shutdown`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                return;
            }

            //only increment the counter if the exit code was > 0
            if(code !== 450001){
                restartCounts[channelIndex] += 1;
                log.info(`Worker for channel index ${channelIndex} (${twitchChannels[channelIndex]}) has been restarted ${restartCounts[channelIndex]} times`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }else{
                log.info(`Worker for channel index ${channelIndex} (${twitchChannels[channelIndex]}) has exited with code ${code} however, it was necessary for a reboot due to change.`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            }

            if (restartCounts[channelIndex] > 3) {
                log.error(`Worker for channel index ${channelIndex} (${twitchChannels[channelIndex]}) has hit the max restart count and will not be restarted`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

                workers.splice(workers.indexOf(worker), 1);
                if(workers.length === 0){
                    log.warn(`All workers have been shutdown`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                    gracefulShutdown();
                }

                return;
            }

            // Restart worker
            log.warn(`Restarting worker for channel index ${channelIndex}`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            const newWorker = cluster.fork({channel: twitchChannels[channelIndex]});
            workers[channelIndex] = newWorker;
            workerToChannelIndexMap[newWorker.id] = channelIndex; // Update mapping with new worker ID
        });

        async function updateChannels() {
            // Fetch new channels from the database or other source
            // Update twitchChannels array

            //clear the current array
            twitchChannels = [];

            users = await Users.findAll({raw: true});

            //update the channels
            if(users.length === 0){
                log.warn(`No channels found in the DB`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                //use these channels from the env
                twitchChannels = process.env.TMI_CHANNELS.split(',');
            }else{
                //let's build the array of channels, we will only fork workers for channels that are enabled.
                users.forEach((user) => {
                    if(user.isEnabled)
                        twitchChannels.push(user.login);
                });
            }
        }

        function restartWorkers() {
            // Reset the restart count
            restartCounts = {}
            // reset the worker array
            workers = [];
            //reset the worker to channel index map
            workerToChannelIndexMap = {};

            // Fork workers.
            for (let i = 0; i < twitchChannels.length; i++) {
                // Fork a worker for each channel
                const worker = cluster.fork({channel: twitchChannels[i]});
                // Keep track of the worker
                workers.push(worker);
                restartCounts[i] = 0; // Use channel index as the identifier
                workerToChannelIndexMap[worker.id] = i; // Map worker ID back to channel index
            }
        }

        cluster.on('message', (worker, message, handle) => {
            if (message.type === 'updateChannels') {
                // Logic to update channels
                updateChannels().then(() => {
                    // Optionally, you can also handle restarting workers here
                    restartWorkers();
                });
            }
        });


        async function gracefulShutdown(){
            log.info(`Main received Signal to Quit`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            isShuttingDown = true;

            //close out of the db connection
            await sequelize.close().then(() => log.info('DB connection closed', {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})).catch((e) => log.error(e, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"}));

            setTimeout(() => {
                log.info('Completing shutdown after 10 seconds', {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                process.exit(0);
            }, 10000);
        }

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }else{
        const channel = process.env.channel;
        log.info(`Worker ${process.pid} started for channel ${channel}`, {service: "Cluster", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

        //for each channel, we will have a webserver
        const app = express();

        const passport = require('passport');
        const TwitchStrategy = require('passport-twitch-new').Strategy;
        const expressSession = require('express-session');
        const FileStore = require('session-file-store')(expressSession);
        const cookieParser = require('cookie-parser');
        const bodyParser = require('body-parser');

        //set user command cooldown
        const userCooldown = new Map();

        //load the commands
        await loadCommands(path.join(__dirname, '/src/commands')).catch((e) => log.error(e,{service: "Command Handler", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"}));

        //new client
        const client = new tmi.Client({
            options: {
                debug: process.env.TMI_DEBUG === 'true' ? true : false,
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
            channels: [process.env.channel]
        });

        //let's setup the prefix.
        let global_prefix = await Settings.findOne(
            {
                where: {
                    [Op.and] : [
                        {
                            key: 'prefix'
                        },
                        {
                            type: 'GLOBAL'
                        }
                    ]
                }
            }
        );

        let prefix = await Settings.findOne(
            {
                where: {
                    [Op.and] : [
                        {
                            key: 'prefix'
                        },
                        {
                            type: 'CHANNEL'
                        },
                        {
                            channeluserid: process.env.channel
                        }
                    ]
                }
            }
        );

        //now let's just go down the list...
        prefix = prefix ? prefix.value : global_prefix ? global_prefix.value : process.env.TMI_COMMAND_PREFIX || '!';
        log.debug(`Prefix for channel ${channel} is ${prefix}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

        client.on('connected', (addr, port) => {
            log.info(`Connected to ${addr}:${port}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        client.on('connecting', (addr, port) => {
            log.info(`Connecting to ${addr}:${port}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        client.on('disconnected', (reason) => {
            log.warning(`Disconnected: ${reason}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        client.on('logon', () => {
            log.info(`Logged in, Ready to rock`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        client.on('message', async (channel, tags, message, self) => {
            const isOwner = tags.username.toLowerCase() === channel.slice(1).toLowerCase();

            // Ignore echoed messages.
            if(self) return;

            // Ignore messages from other channels
            const ignoredChannels = process.env.TMI_IGNORE_USERS.split(',') || [];
            if(ignoredChannels.includes(tags.username.toLowerCase())){
                return;
            }

            //this is where we can track messages for channel summaries later.
            //Insert the message into the database, ignoring commands
            if(!message.startsWith(prefix)){
                if(message.length > 0)
                    await Messages.create({
                        channel: channel.slice(1),
                        username: tags.username,
                        Message: message.toString().replace(/[^\x00-\x7F]/g, "")
                    }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})});

                let points = 0;

                //let's add points to the user based on a sliding scale of how many characters they type.
                if(message.length > 0 && message.length < 30)
                    points = message.length * 3; //3 point per character
                else if(message.length >= 30 && message.length < 50)
                    points = message.length * 2; //2 points per character
                else if(message.length >= 50 && message.length < 255)
                    points = message.length; //1 points per character
                else
                    points = 255; //max points

                //check if the user exists in the gamble database.
                const user = await Gamble.findOne({
                    where: {
                        channel: channel.slice(1),
                        user: tags.username
                    }
                }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})});

                if(user){
                    //update the user's points
                    await Gamble.update({
                        amount: user.amount + points
                    }, {
                        where: {
                            channel: channel.slice(1),
                            user: tags.username
                        }
                    }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})});
                }else{
                    //create the user
                    await Gamble.create({
                        channel: channel.slice(1),
                        user: tags.username,
                        amount: points
                    }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})});
                }
            }

            //let's check for the prefix next.
            if(!message.startsWith(prefix)) return;

            //check the usercooldown
            if(userCooldown.has(tags.username)){
                const lastUsed = userCooldown.get(tags.username);
                const diff = Date.now() - lastUsed;
                if(diff < 5000){
                    return;
                }
            }

            //let's remove the prefix from the message and get the command
            const args = message.slice(prefix.length).split(' ');
            const command = args.shift().toLowerCase();

            //let's check if the channel has disabled this command...
            const disabledCommands = await Settings.findOrCreate({
                where:{
                    channeluserid: channel.slice(1),
                    key: "disabledCommands"
                },
                defaults: {
                    options: JSON.stringify([]),
                    type: "CHANNEL"
                },
                raw: true,
                limit: 1
            }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"})});

            const disabled = JSON.parse(disabledCommands[0].options);

            //log.info(`Channel ${channel} has a total of ${disabled.length} disabled commands`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

            if(!isOwner && disabled.includes(command)){
                client.say(channel, `@${tags.username}, Command: ${command} has been disabled.`);
                return;
            }

            //check if we have that command.
            if(hasCommand(command)) {
                log.info(`Command ${command} received from ${tags.username}`, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                //let's make sure this isn't a mod only command or is the owner of the channel.
                if(getCommand(command).isModOnly && !tags.mod && (tags.username !== process.env.channel)){
                    return;
                }

                getCommand(command).execute(channel, tags, args, self, client);
            }
        });

        //connect the client
        await client.connect()
            .catch(e => { log.error(e, {service: "Twitch Manager", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"}) });

        let permissions = process.env.TMI_API_SCOPES.split(" ") || "";
        permissions = JSON.stringify(permissions.toString());

        /* webserver settings */
        passport.use(new TwitchStrategy({
            clientID: process.env.TMI_CLIENT_ID,
            clientSecret: process.env.TMI_CLIENT_SECRET,
            callbackURL: process.env.TMI_CALLBACK_URL,
            scope: process.env.TMI_TWITCH_SCOPES
        }, async (accessToken, refreshToken, profile, done) => {

            const [user, created] = await Users.findOrCreate({where: {
                twitchId: profile.id,
                },
                defaults: {
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    permissions: permissions,
                    login: profile.login
                }
            }).catch((e) => {
                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                return done(e, null);
            });

            return done(null, user);
        }));

        // Express and Passport Session
        app.use(bodyParser.json())
        app.use(cookieParser());
        app.use(expressSession(
            {
                secret: process.env.COOKIE_SECRET,
                resave: false,
                saveUninitialized: true,
                store: new FileStore({}),
            }
        ));
        app.use(passport.initialize());
        app.use(passport.session());

        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '/src/views'));
        app.use(express.static(path.join(__dirname, '/public')));

        // Serialize and deserialize user instances to and from the session.
        passport.serializeUser(function(user, done) { done(null, user.id); });
        passport.deserializeUser(function(id, done) {
            Users.findOne({ where: { id: id } }).then(user => {
                done(null, user);
            });
        });

        // Twitch Auth Route
        app.get('/auth/twitch', passport.authenticate('twitch'));
        app.get('/auth/twitch/callback',
            passport.authenticate('twitch', { failureRedirect: '/' }),
            function(req, res) {
                // Successful authentication, redirect home.
                res.redirect('/');
            });

        //lets handle the logout
        app.get('/logout', (req, res, next) => {
            req.logout(function(err) {
                if (err) { return next(err); }
                res.redirect('/');
            });
        });

        app.put('/api/settings/enable/:channel', async (req, res) => {
           //make sure the user is authenticated
            if (!req.isAuthenticated()) {
                return res.status(401).json({error: 'Not Authenticated'});
            }

            //check if the user is the owner of the channel
            if(req.user.login !== req.params.channel){
                return res.status(401).json({error: 'Not Authorized'});
            }
            //get the channel
            const channel = req.params.channel;

            //get channel settings
            const channelSettings = await Users.findOne({
                where: {
                    login: channel
                },
                raw: true
            }).catch((e) => {
                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                return res.status(500).json({error: e});
            });

            //make sure to only allow this change once an hour
            const now = new Date();
            const lastChange = new Date(channelSettings.updatedAt);
            const diff = now - lastChange;
            const diffHours = Math.floor(diff / 1000 / 60 / 60);

            if(diffHours < 1){
                if(process.env.NODE_ENV !== 'development')
                    return res.status(400).json({error: 'You can only enable/disable the channel once an hour.'});
            }

            //update the channel
            const channelUpdate = await Users.update({
                isEnabled: req.body.isEnabled
            }, {
                where: {
                    login: channel
                },
                raw: true
            }).catch((e) => {
                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                return res.status(500).json({error: e});
            });

            //get the updated channel
            const updatedChannel = await Users.findOne({
                where: {
                    login: channel
                },
                raw: true
            }).catch((e) => {
                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                return res.status(500).json({error: e});
            });

            //we now need to restart the cluster
            process.send({ type: 'updateChannels' });

            return res.status(200).json({updated: channelUpdate[0], channel: updatedChannel});
        });

        app.get('/', (req, res) => {
            if (req.isAuthenticated()) {
                //get all the messages for the person logged in...
                const msgs = Messages.findAll({
                    where: {
                        username: req.user.login
                    },
                    order: [
                        ['createdAt', 'ASC']
                    ],
                    raw: true
                }).then((messages) => {
                    //get the channel data
                    const channel = Users.findOne({
                        where: {
                            login: req.user.login
                        },
                        raw: true
                    }).then((channel) => {
                        //get the settings for the channel
                        const settings = Settings.findAll({
                            where: {
                                channeluserid: channel.login
                            },
                            raw: true
                        }).then((settings) => {
                            //also grab any gambling data
                            const gambling = Gamble.findAll({
                                where: {
                                    user: req.user.login
                                },
                                raw: true
                            }).then((gambling) => {
                                res.render('dashboard.ejs', { user: req.user, messages: messages, channel: channel, settings: settings, gambling: gambling });
                            }).catch((e) => {
                                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                                res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                            });
                        }).catch((e) => {
                            log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                            res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                        });
                    }).catch((e) => {
                        log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                        res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                    });
                }).catch((e) => {
                    log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                    res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                });
            } else {
                res.render('login.ejs');
            }
        });

        const port = process.env.APP_PORT || 3000;

        const server = app.listen(port, () => {
            log.info(`Worker ${process.pid} listening at http://localhost:${port}`, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        //make sure we handle the exit gracefully
        process.on('exit', (code) => {
            log.info(`Worker ${process.pid} stopped with exit code ${code}`, {service: "Main", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
        });

        process.on('message', message => {
            if (message.type === 'shutdown') {
                gracefulShutdown().then(() => {
                    process.exit(450002);
                });
            }
        });

        async function gracefulShutdown(){
            log.info(`Worker ${process.pid} received SIGINT`, {service: "Main", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

            //close the webserver
            server.close(() => {
                log.info(`Webserver shutdown on worker ${process.pid}`, {service: "Web Server", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});

                //because this never resolves we need to check if the client is connected.
                client.disconnect();

                sequelize.close().then(() => {
                   log.info(`DB connection closed on worker ${process.pid}`, {service: "DB", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
                   process.exit(0);
                });
            });
        }

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }
})();

module.exports = {
    startTime
}