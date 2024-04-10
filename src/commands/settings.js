const Settings = require('../lib/database/models/settings');
const { hasCommand, getCommand } = require('../lib/commandHandler');

module.exports = {
    name: "settings",
    aliases: ['config', 'options'],
    description: "This command provides the settings of the bot. Usage: !settings <setting> <option> <value>",
    isModOnly: true,
    async execute(channel, tags, args, self, client) {
        const setting = args[0];
        const option = args[1];
        let value = args[2];

        if(!setting ){
            client.say(channel, `@${tags.username}, Please provide the setting`);
            return;
        }

        if(setting == "list"){
            const settings = await Settings.findAll({
                where:{
                  channeluserid: channel.slice(1)
                },
                raw: true
            });

            let msg = `@${tags.username}, Here are the settings for this channel: `;

            if(settings.length == 0){
                msg += "No settings found.";
                client.say(channel, msg);
                return;
            }

            let i = 1;
            settings.forEach(setting => {
                msg += `${i++}. ${setting.key} (${setting.description}): ${setting.value} ${(setting.options)?setting.options:""} `;
            });

            client.say(channel, msg);
            return;
        }

        if(!option || !value){
            client.say(channel, `@${tags.username}, Please provide the option and value.`);
            return;
        }

        switch(setting){
            case "disabledCommands":
                //check if the command exists...
                if(!hasCommand(value)){
                    client.say(channel, `@${tags.username}, Command: ${value} does not exist.`);
                    return;
                }

                //we want to make sure we are getting the actual command name so we aren't doing 30000 aliases...
                value = getCommand(value).name;

                //get the disabled commands
                const disabledCommands = await Settings.findOne({
                    where:{
                        channeluserid: channel.slice(1),
                        key: "disabledCommands"
                    },
                    raw: true
                });

                switch(option){
                    case "set":
                        //it's a json array set in options.
                        if(disabledCommands) {
                            //we need to check if this command is already disabled.
                            const disabled = JSON.parse(disabledCommands.options);
                            if(disabled.includes(value)){
                                client.say(channel, `@${tags.username}, Command: ${value} is already disabled.`);
                                return;
                            }
                            disabled.push(value);
                            await Settings.update({
                                options: JSON.stringify(disabled)
                            }, {
                                where: {
                                    channeluserid: channel.slice(1),
                                    key: "disabledCommands"
                                }
                            });
                        }else{
                            await Settings.create({
                                channeluserid: channel.slice(1),
                                key: "disabledCommands",
                                options: JSON.stringify([value]),
                                description: "The disabled commands for the bot.",
                                type: "CHANNEL"
                            });
                        }
                        client.say(channel, `@${tags.username}, Command: ${value} has been disabled.`);
                        break;
                    case "get":
                        //get the disabled commands
                        client.say(channel, `@${tags.username}, The disabled commands are: ${disabledCommands.options}`);

                        break;
                    case "remove":
                        //remove the disabled command
                        if(disabledCommands) {
                            const disabled = JSON.parse(disabledCommands.options);
                            if(disabled.includes(value)){
                                disabled.splice(disabled.indexOf(value), 1);
                                await Settings.update({
                                    options: JSON.stringify(disabled)
                                }, {
                                    where: {
                                        channeluserid: channel.slice(1),
                                        key: "disabledCommands"
                                    }
                                });
                            }else{
                                client.say(channel, `@${tags.username}, Command: ${value} is not disabled.`);
                                return;
                            }
                        }
                        client.say(channel, `@${tags.username}, Command: ${value} has been enabled.`);
                        break;
                    default:
                        client.say(channel, `@${tags.username}, Invalid option for setting: ${setting}.`);
                        return;
                }

                break;
            case "prefix":
                //get the prefix
                const prefix = await Settings.findOne({
                    where:{
                        channeluserid: channel.slice(1),
                        key: "prefix"
                    },
                    raw: true
                });

                switch(option){
                    case "set":
                        //set the prefix
                        if(prefix) {
                            await Settings.update({
                                value: value
                            }, {
                                where: {
                                    channeluserid: channel.slice(1),
                                    key: "prefix"
                                }
                            });
                        }else{
                            await Settings.create({
                                channeluserid: channel.slice(1),
                                key: "prefix",
                                value: value,
                                description: "The prefix for the bot."
                            });
                        }

                        client.say(channel, `@${tags.username}, Prefix has been set to: ${value}`);
                        //let's exit this worker and get it to reboot.
                        process.exit(450001);
                        break;
                    case "get":
                        //get the prefix
                        client.say(channel, `@${tags.username}, The prefix is: ${prefix.value}`);
                        break;
                    case "remove":
                        //remove the prefix
                        await Settings.destroy({
                            where: {
                                channeluserid: channel.slice(1),
                                key: "prefix"
                            }
                        });
                        client.say(channel, `@${tags.username}, Prefix has been removed.`);
                        //let's exit this worker and get it to reboot.
                        process.exit(-1);
                        break;
                    default:
                        client.say(channel, `@${tags.username}, Invalid option for setting: ${setting}.`);
                        return;
                }
                break;
            default:
                client.say(channel, `@${tags.username}, Invalid setting: ${setting}.`);
                return;
        }
    }
}