
module.exports = {
    name: "ping",
    aliases: ['test', 'pong'],
    description: "This command is used to test if the bot is online. Usage: !ping",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        client.say(channel, `@${tags.username}, Pong!`);
    }
}