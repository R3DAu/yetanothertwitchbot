//get the version of the bot from package.json
const { version } = require('../../package.json');

module.exports = {
    name: "version",
    aliases: ['v', 'ver'],
    description: "This command provides the version of the bot. Usage: !version",
    isModOnly: true,
    async execute(channel, tags, args, self, client) {
        client.say(channel, `@${tags.username}, The bot is running version: ${version}`);
    }
}