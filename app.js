require('dotenv').config();
const os= require("os");
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
    console.log('This is a test build');
    process.exit(0);
}

/* let's do the db connection first then we can start the app  */
(async () => {
    try{
        await connect().then(async () => {
            console.log('DB connection successful');

            await Messages.sync({alter: false}).then(() => {
                console.log('Messages table created');
            }).catch((e) => {
                console.error(e);
            });

            await Settings.sync({alter: false}).then(() => {
                console.log('Settings table created');
            }).catch((e) => {
                console.error(e);
            });

            await Users.sync({alter: false}).then(() => {
                console.log('Users table created');
            }).catch((e) => {
                console.error(e);
            });

            await Hastags.sync({alter: false}).then(() => {
                console.log('Hastags table created');
            }).catch((e) => {
                console.error(e);
            });

            await Gamble.sync({alter: false}).then(() => {
                console.log('Gamble table created');
            }).catch((e) => {
                console.error(e);
            });
        });
    }catch(e){
        console.error(e);
        /* exit the process */
        process.exit(1);
    }

    if (cluster.isMaster) {
        let twitchChannels = [];

        //let's get the channels from the DB... we will use this to fork the workers
        const Users = require('./src/lib/database/models/user');
        const users = await Users.findAll({raw: true});

        if(users.length === 0){
            console.error('No channels found in the DB');
            //use these channels from the env
            twitchChannels = process.env.TMI_CHANNELS.split(',');
        }else{
            //lets build the array from the login field
            twitchChannels = users.map((user) => user.login);
        }

        console.log(`Master ${process.pid} is running`);

        const workers = [];
        const restartCounts = {};
        const workerToChannelIndexMap = {};

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
            console.log(`worker ${worker.process.pid} died`);
            //get the channel index
            const channelIndex = workerToChannelIndexMap[worker.id]; // Retrieve channel index

            // Check if the worker is being restarted due to a shutdown
            if(isShuttingDown){
                workers.splice(workers.indexOf(worker), 1);
                if(workers.length === 0){
                    console.log('All workers have been shutdown');
                    process.exit(0);
                }
                return;
            }

            restartCounts[channelIndex] += 1;

            if (restartCounts[channelIndex] > 3) {
                console.log(`Worker for channel index ${channelIndex} (${twitchChannels[channelIndex]}) has hit the max restart count and will not be restarted`);

                workers.splice(workers.indexOf(worker), 1);
                if(workers.length === 0){
                    console.log('All workers have been shutdown, starting Main shutdown');
                    gracefulShutdown();
                }

                return;
            }

            // Restart worker
            console.log(`Restarting worker for channel index ${channelIndex}`);
            const newWorker = cluster.fork({channel: twitchChannels[channelIndex]});
            workers[channelIndex] = newWorker;
            workerToChannelIndexMap[newWorker.id] = channelIndex; // Update mapping with new worker ID
        });

        async function gracefulShutdown(){
            console.log(`Main received Signal to Quit`);
            isShuttingDown = true;

            //close out of the db connection
            await sequelize.close().then(() => console.log('DB connection closed on main'));

            setTimeout(() => {
                console.error('Completing shutdown after 10 seconds');
                process.exit(0);
            }, 10000);
        }

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }else{
        //for each channel, we will have a webserver
        const app = express();

        const passport = require('passport');
        const TwitchStrategy = require('passport-twitch-new').Strategy;
        const session = require('express-session');


        //set user command cooldown
        const userCooldown = new Map();

        const channel = process.env.channel;
        console.log(`Worker ${process.pid} started for channel ${channel}`);

        //load the commands
        await loadCommands(path.join(__dirname, '/src/commands')).catch((e) => console.error(e));

        //new client
        const client = new tmi.Client({
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

        //connect the client
        await client.connect();

        client.on('connected', (addr, port) => {
            console.log(`* Connected to ${addr}:${port}`);
        });

        client.on('message', async (channel, tags, message, self) => {
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
                    }).catch((e) => {console.error(e)});
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

            //check if we have that command.
            if(hasCommand(command)) {
                console.log(tags.username + ' used command ' + command);
                //let's make sure this isn't a mod only command or is the owner of the channel.
                if(getCommand(command).isModOnly && !tags.mod && (tags.username !== process.env.channel)){
                    return;
                }

                getCommand(command).execute(channel, tags, args, self, client);
            }
        });

        let permissions = process.env.TMI_API_SCOPES.split(" ") || "";
        permissions = JSON.stringify(permissions.toString());

        /* webserver settings */
        passport.use(new TwitchStrategy({
            clientID: process.env.TMI_CLIENT_ID,
            clientSecret: process.env.TMI_CLIENT_SECRET,
            callbackURL: process.env.TMI_CALLBACK_URL,
            scope: process.env.TMI_TWITCH_SCOPES
        }, async (accessToken, refreshToken, profile, done) => {

            const [user, created] = await User.findOrCreate({where: {
                twitchId: profile.id,
                },
                defaults: {
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    permissions: permissions,
                    login: profile.login
                }
            }).catch((e) => {
                console.error(e);
                return done(e, null);
            });

            return done(null, user);
        }));

        // Express and Passport Session
        app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
        app.use(passport.initialize());
        app.use(passport.session());

        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '/src/views'));

        // Serialize and deserialize user instances to and from the session.
        passport.serializeUser(function(user, done) { done(null, user.id); });
        passport.deserializeUser(function(id, done) {
            User.findOne({ where: { id: id } }).then(user => {
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

        app.get('/', (req, res) => {
            if (req.isAuthenticated()) {
                res.render('dashboard.ejs', { user: req.user });
            } else {
                res.render('login.ejs');
            }
        });

        const port = process.env.APP_PORT || 3000;

        const server = app.listen(port, () => {
            console.log(`Worker ${process.pid} listening at http://localhost:${port}`);
        });

        //make sure we handle the exit gracefully
        process.on('exit', (code) => {
            console.log(`Worker ${process.pid} stopped with exit code ${code}`);
        });

        async function gracefulShutdown(){
            console.log(`Worker ${process.pid} received SIGINT`);

            //close the webserver
            server.close(() => {
                console.log('Webserver shutdown on worker ' + process.pid);

                //because this never resolves we need to check if the client is connected.
                client.disconnect();

                sequelize.close().then(() => {
                    console.log('DB connection closed on worker ' + process.pid);
                   process.exit(0);
                });
            });
        }

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }
})();




