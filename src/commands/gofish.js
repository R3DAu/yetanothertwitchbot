const FishCaught = require('../lib/database/models/fishCaught');
const fishes = require('../data/fish.json');

module.exports = {
    name: "gofish",
    aliases: ['goFish', 'fishing'],
    description: "A parody of the fish game, with out the graphics. Usage: !gofish",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //select a random fish from the fish.json file.
        const fish = fishes[Math.floor(Math.random() * fishes.length)];

        //add this fish to the user's caught fish list (or add it to the times they have caught it)
        const created = await FishCaught.findOrCreate({
            where: {
                channel: channel,
                userName: tags.username,
                fishName: fish.name
            },
            defaults: {
                timesCaught: 1
            },
            raw: true
        });

        if(!created[1]){
            //increment the amount of fish caught.
            await FishCaught.increment('timesCaught', { where: { channel: channel, userName: tags.username, fishName: fish.name } });
        }

        //send a message to the user with the fish they caught.
        client.say(channel, `@${tags.username}, You caught a ${fish.rarity} ${fish.name}! it's worth ${fish.value}. You have caught ${created[0].timesCaught} ${fish.name} in total.`);
    }
}