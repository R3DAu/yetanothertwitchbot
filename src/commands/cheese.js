let cheeses = require('../data/cheeses.json');

module.exports = {
    name: "cheese",
    aliases: [],
    description: "This command is used get a random cheese. Usage: !cheese",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        const randomCheese = cheeses[Math.floor(Math.random() * cheeses.length)];
        client.say(channel, `Hey @${tags.username}, Here is your random cheese: ${randomCheese} (Out of ${cheeses.length} cheeses)`);
    }
}