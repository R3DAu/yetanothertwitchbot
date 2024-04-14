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
const log = require("../logger");
const express = require("express");

const path = require("path");
const tmi = require("tmi.js");
const Settings = require("../database/models/settings");
const {Op} = require("sequelize");
const Messages = require("../database/models/messages");
const Gamble = require("../database/models/gamble");
const Users = require("../database/models/user");
const {sequelize} = require("../database/db");


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