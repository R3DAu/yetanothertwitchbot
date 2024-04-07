const Gamble = require('../lib/database/models/gamble');

module.exports = {
    name: "balance",
    aliases: ['bal'],
    description: "This command is used to check your balance. Usage: !balance",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //let's get the user's balance
        const balance = await Gamble.findOrCreate({
            where: {
                channel: channel.slice(1),
                user: tags.username
            },
            defaults: {
                amount: 100
            },
            raw: true
        });

        client.say(channel, `@${tags.username}, Your balance is ${balance[0].amount}.`);
    }
}