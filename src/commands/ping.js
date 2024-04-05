
module.exports = {
    name: "ping",
    isModOnly: false,
    async execute(channel, tags, message, self, client) {
        client.say(channel, `@${tags.username}, Pong!`);
    }
}