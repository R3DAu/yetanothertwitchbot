const Messages = require("./database/models/messages");
const Gamble = require("./database/models/gamble");
const log = require("./logger");
const { hasCommand, getCommand } = require("./commandHandler");
const Settings = require("./database/models/settings");

module.exports = class twitchMessage {
    #isOwner;
    #isCommand;
    #isMod;
    #isIgnored;
    #isCooldown;
    #isDisabled;

    constructor(client, channel, userstate, message, self, commandPrefix, userCooldown){
        this.client         = client;
        this.userstate      = userstate;
        this.message        = this.removeNonASCII(message).trim();
        this.self           = self;
        this.commandPrefix  = commandPrefix;
        this.userCooldown   = userCooldown;
        this.user           = this.userstate.username.trim().toLowerCase();
        this.channel        = channel.trim().slice(1).toLowerCase();

        this.#isOwner       = this.user === this.channel
        this.#isCommand     = this.message.startsWith(this.commandPrefix);
        this.#isMod         = this.userstate.mod;
        this.#isDisabled    = false;

        this.args           = (this.#isCommand) ? this.message.slice(this.commandPrefix.length).split(' ') : null;
        this.command        = (this.#isCommand) ? this.args.shift().trim().toLowerCase() : null;

        this.init();
    }

    async init(){
        //check if this is an ignored channel message
        this.ignoredChannels = process.env.TMI_IGNORE_USERS.split(',') || [];
        this.#isIgnored = this.ignoredChannels.includes(this.channel);

        //check if this user is on cooldown.
        this.#isCooldown = this.userCooldown.has(this.user) && this.isCommand();

        if(!this.isCooldown && this.isCommand){
            this.userCooldown.set(this.user, Date.now());
            setTimeout(() => {
                this.userCooldown.delete(this.user);
            }, process.env.TMI_COMMAND_COOLDOWN);
        }

        if(this.#isCommand) {
            const disabledCommands = await Settings.findOrCreate({
                where: {
                    channeluserid: this.channel,
                    key: "disabledCommands"
                },
                defaults: {
                    options: JSON.stringify([]),
                    type: "CHANNEL"
                },
                raw: true,
                limit: 1
            }).catch((e) => {
                log.error(e, {
                    service: "Twitch Manager",
                    pid: process.pid,
                    channel: (process.env.channels) ? process.env.channels : "Main"
                })
            });

            if(disabledCommands && disabledCommands[0].options.includes(this.command))
                this.#isDisabled = true;
        }
    }

    isDisabled(){
        return this.#isDisabled;
    }

    isCommand(){
        return this.#isCommand;
    }

    isOwner(){
        return this.#isOwner;
    }

    isMod(){
        return this.#isMod || this.#isOwner;
    }

    isSelf(){
        return this.self;
    }

    isSub(){
        return this.userstate.subscriber;
    }

    isIgnored(){
        return this.#isIgnored;
    }

    isCooldown(){
        return this.#isCooldown;
    }

    removeNonASCII(str) {
        // This regex matches characters outside of the ASCII range
        return str.replace(/[^\x00-\x7F]/g, "");
    }

    async handleAccounting(){
        if(this.isSelf || this.isIgnored) return;

        if(!this.isCommand()){
            let points = 0;

            //let's add points to the user based on a sliding scale of how many characters they type.
            if(this.message.length > 0 && this.message.length < 30)
                points = (this.message.length * 3) * 0.5; //1.5 points per character
            else if(this.message.length >= 30 && this.message.length < 50)
                points = (this.message.length * 2) * 0.3; //0.6 points per character
            else if(this.message.length >= 50 && this.message.length < 255)
                points = (this.message.length * 0.2); //0.2 points per character
            else
                points = 255; //max points

            //Round up points.
            points = Math.ceil(points);

            //check if the user exists in the gamble database.
            const user = await Gamble.findOne({
                where: {
                    channel: this.channel,
                    user: this.user
                }
            }).catch((e) => {log.error(e, {service: "Twitch Manager", pid: process.pid, channel: this.channel})});

            if(user) {
                //update the user's points
                user.amount += points;
                await user.save().catch((e) => {
                    log.error(e, {
                        service: "Twitch Manager",
                        pid: process.pid,
                        channel: (process.env.channels) ? process.env.channels : "Main"
                    })
                });
            }else{
                //create a new user
                await Gamble.create({
                    channel: this.channel,
                    user: this.user,
                    amount: points
                }).catch((e) => {
                    log.error(e, {
                        service: "Twitch Manager",
                        pid: process.pid,
                        channel: (process.env.channels) ? process.env.channels : "Main"
                    })
                });
            }
        }
    }

    async handleCommand(){
        return new Promise(async (resolve, reject) => {
            if(this.isSelf() || this.isCooldown() || this.isIgnored()) return resolve(false);

            if(this.isDisabled()) {
                log.info(`The command ${this.command} is disabled in this channel.`, {service: "Twitch Manager", pid: process.pid, channel: this.channel})
                this.client.say(`#${this.channel}`, `The command ${this.command} is disabled in this channel.`);
                return resolve(false);
            }

            //let's check if this command exists.
            if(hasCommand(this.command)){
                let command = getCommand(this.command);

                log.info(`User ${this.user} executed command${(this.command !== command.name)? " alias " : " "}${this.command} ${(this.command !== command.name)? '(' + command.name + ')' : ""}`, {service: "Twitch Manager", pid: process.pid, channel: this.channel});

                //check for mod only commands.
                if(command.isModOnly && !this.isMod()){
                    log.info(`The command ${this.command} is a mod only command.`, {service: "Twitch Manager", pid: process.pid, channel: this.channel})
                    this.client.say(`#${this.channel}`, `The command ${this.command} is a mod only command.`);
                    return resolve(false);
                }

                command.execute(this.channel, this.userstate, this.args, this.self, this.client);
                return resolve(true);
            }
        })
    }

    async handleMessage(){
        if(this.isSelf() || this.isIgnored()) return;

        if(!this.isCommand()){
            //record the message.
            await Messages.create({
                channel: this.channel,
                username: this.userstate.username,
                Message: this.message
            });
        }

        await this.handleAccounting();

        if(this.isCommand()){
            let command = this.message.split(' ')[0].slice(1).toLowerCase();
            let args = this.message.split(' ').slice(1);
            await this.handleCommand(command, args);
        }
    }
}