
module.exports = {
    name: "description",
    aliases: ['desc'],
    description: "Provides descriptions of the bot or a specific command. Usage: !description <command>",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //get all the commands
        const commands = require('../lib/commandHandler');
        if(args.length < 1){
            client.say(channel, `@${tags.username}, I am a bot that can help you manage your channel. I can provide you with a summary of chat in the last 5 minutes, manage hashtags, and more. Use !description <command> to get more information about a specific command.`);
            return;
        }

        //list all commands if args[0] is 'all'
        if(args[0] === 'all'){
            let commandList = "";

            commands.commands.forEach(command => {
                commandList += `${command.name} (aliases: ${command.aliases.join(", ")}), `;
            });

            client.say(channel, `@${tags.username}, Here is a list of all commands: ${commandList}`);
            return;
        }

        //get the command
        const command = commands.getCommand(args[0]);
        if(!command){
            client.say(channel, `@${tags.username}, The command ${args[0]} does not exist.`);
            return;
        }

        client.say(channel, `@${tags.username}, ${command.description}, Command aliases: [${command.aliases.join(", ")}], ${command.isModOnly ? ", This command is for moderators only." : ""}`);
    }
}