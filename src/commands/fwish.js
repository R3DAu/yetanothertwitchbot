module.exports = {
    name: "fwish",
    aliases: [],
    description: "A parody of the !fish command in Burntsonic's channel. Usage: !fwish",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        client.say(channel, `!fish Let me try!`);
    }
}