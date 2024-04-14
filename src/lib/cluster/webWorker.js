require('dotenv').config();
const log = require("../logger");
const {sequelize, connect} = require("../database/db");
const workerStates  = require("../helpers/workerStates");
const express = require('express');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const expressSession = require('express-session');
const FileStore = require('session-file-store')(expressSession);
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const Users = require("../database/models/user");
const path = require("path");
const Messages = require("../database/models/messages");
const Settings = require("../database/models/settings");
const Gamble = require("../database/models/gamble");

module.exports = class WebWorker {
    cluster = null;
    workerState = workerStates.STARTING;
    permissions = null;
    app = null;
    port = process.env.APP_PORT || 3000;
    server = null;

    constructor(cluster){
        log.info(`Slave ${process.pid} is running`, {service: "Cluster", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
        this.cluster = cluster;
        //for each channel, we will have a webserver
        this.app = express();
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

                this.permissions = process.env.TMI_API_SCOPES.split(" ") || "";
                this.permissions = JSON.stringify(this.permissions.toString());
                resolve(true);
            } catch (e) {
                log.error(e, {
                    service: "Web Worker",
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
                await this.init();

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
                            permissions: this.permissions,
                            login: profile.login
                        }
                    }).catch((e) => {
                        log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                        return done(e, null);
                    });

                    return done(null, user);
                }));

                this.app.use(bodyParser.json())
                this.app.use(cookieParser());
                this.app.use(expressSession(
                    {
                        secret: process.env.COOKIE_SECRET,
                        resave: false,
                        saveUninitialized: true,
                        store: new FileStore({}),
                    }
                ));

                this.app.set('view engine', 'ejs');
                this.app.set('views', path.join(__dirname, '/../../views'));
                this.app.use(express.static(path.join(__dirname, '/../../../public')));

                this.app.use(passport.initialize());
                this.app.use(passport.session());

                passport.serializeUser(function(user, done) { done(null, user.id); });
                passport.deserializeUser(function(id, done) {
                    Users.findOne({ where: { id: id } }).then(user => {
                        done(null, user);
                    });
                });

                this.app.get('/auth/twitch', passport.authenticate('twitch'));
                this.app.get('/auth/twitch/callback',
                    passport.authenticate('twitch', { failureRedirect: '/' }),
                    function(req, res) {
                        // Successful authentication, redirect home.
                        res.redirect('/');
                    });

                //lets handle the logout
                this.app.get('/logout', (req, res, next) => {
                    req.logout(function(err) {
                        if (err) { return next(err); }
                        res.redirect('/');
                    });
                });

                this.app.put('/api/settings/enable/:channel', async (req, res) => {
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
                        log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                        return res.status(500).json({error: e});
                    });

                    //get the updated channel
                    const updatedChannel = await Users.findOne({
                        where: {
                            login: channel
                        },
                        raw: true
                    }).catch((e) => {
                        log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                        return res.status(500).json({error: e});
                    });

                    //we now need to restart the cluster
                    process.send({ type: 'updateChannels' });

                    return res.status(200).json({updated: channelUpdate[0], channel: updatedChannel});
                });

                this.app.get('/', (req, res) => {
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
                                        log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                                        res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                                    });
                                }).catch((e) => {
                                    log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                                    res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                                });
                            }).catch((e) => {
                                log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                                res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                            });
                        }).catch((e) => {
                            log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                            res.render('dashboard.ejs', { user: req.user, messages: [], channel: {}, settings: [], gambling: [] });
                        });
                    } else {
                        res.render('login.ejs');
                    }
                });

                this.server = this.app.listen(this.port, () => {
                    log.info(`Worker ${process.pid} listening at http://localhost:${this.port}`, {service: "Web Server Worker", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                });

                this.workerState = workerStates.RUNNING;
            } catch(e) {
                log.error(e, {service: "Cluster Manager", pid: process.pid, channel: (process.env.channels) ? process.env.channels : "Main"});
                await this.stop();
                reject(e);
            }
        });
    }

    async stop(){
        log.info(`Worker received Signal to Quit`, {service: "Cluster", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
        this.workerState = workerStates.STOPPING;

        //close out of the webserver
        await this.server.close().then(() => log.info('Web Server closed', {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"})).catch((e) => log.error(e, {service: "Web Server", pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"}));
    }
}