
module.exports = {
    name: "ping",
    async execute(channel, tags, message, self, client) {
        client.say(channel, `@${tags.username}, Pong!`);
    }
}