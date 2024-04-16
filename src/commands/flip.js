const Gamble = require('../lib/database/models/gamble');

module.exports = {
    name: "flip",
    aliases: ['coinflip', 'coin'],
    description: "This command is used to flip a coin. Usage: !flip <amount> <heads/tails>",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        if(args.length < 2){
            client.say(channel, `@${tags.username}, You need to provide a bet, and an outcome.`);
            return;
        }

        //let's get the user's balance
        const balance = await Gamble.findOrCreate({
            where: {
                channel: channel,
                user: tags.username
            },
            defaults: {
                amount: 100
            },
            raw: true
        });

        const amount = parseInt(args[0]);
        const outcome = args[1];

        if(isNaN(amount)){
            client.say(channel, `@${tags.username}, The amount must be a number.`);
            return;
        }

        if(amount < 1){
            client.say(channel, `@${tags.username}, The amount must be greater than 0.`);
            return;
        }

        //check the user's balance
        if(balance[0].amount < amount){
            client.say(channel, `@${tags.username}, You do not have enough balance to place this bet.`);
            return;
        }

        if(outcome.toLowerCase() !== "heads" && outcome.toLowerCase() !== "tails"){
            client.say(channel, `@${tags.username}, The outcome must be either 'heads' or 'tails'.`);
            return;
        }

        //flip the coin
        const coin = Math.random() < 0.5 ? "heads" : "tails";

        if(coin === outcome){
            //update the user's balance
            await Gamble.update({
                amount: balance[0].amount + (amount * 2)
            }, {
                where: {
                    channel: channel,
                    user: tags.username
                }
            });

            client.say(channel, `@${tags.username}, Congratulations! You won ${amount * 2}!`);
        } else {
            //update the user's balance
            await Gamble.update({
                amount: balance[0].amount - amount
            }, {
                where: {
                    channel: channel,
                    user: tags.username
                }
            });

            client.say(channel, `@${tags.username}, Sorry! You lost ${amount}!`);
        }
    }
}