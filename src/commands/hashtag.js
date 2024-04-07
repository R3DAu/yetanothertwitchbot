const { Op } = require('sequelize');
const Hashtags = require('../lib/database/models/hashtags');

module.exports = {
    name: "hashtag",
    aliases: ['tag', 'tags', 'hashtags'],
    description: "This command allows you to manage hashtags. Usage: !hashtag [list|add|remove|addGlobal|removeGlobal] [hashtag]",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //let's collect all the hashtags from the database...
        const hashtags = await Hashtags.findAll({
            where: {
                [Op.or]: [
                    { type: 'GLOBAL' },
                    { channel: channel.slice(1) } //get rid of the # symbol
                ]
            }
        });

        if(hashtags.length < 1 && args.length < 1){
            client.say(channel, `@${tags.username}, There are no hashtags available.`);
            return;
        }

        if(args.length < 1){
            //we will grab a random hashtag.
            const randomHashtag = hashtags[Math.floor(Math.random() * hashtags.length)];
            client.say(channel, `${randomHashtag.hashtag}`);
            return;
        }

        switch(args[0]){
            case "list":
                const list = hashtags.map(h => h.hashtag).join(", ");
                client.say(channel, `@${tags.username}, ${list}`);
                break;
            case "add":
                if(!args[1]){
                    client.say(channel, `@${tags.username}, You need to provide a hashtag to add.`);
                    return;
                }

                let hashtag = args[1];
                //check if they have the # symbol
                if(!hashtag.startsWith('#')){
                    hashtag = `#${hashtag}`;
                }

                if(hashtags.some(h => h.hashtag.toLowerCase() === hashtag.toLowerCase())){
                    client.say(channel, `@${tags.username}, The hashtag ${hashtag} already exists.`);
                    return;
                }

                await Hashtags.create({
                    hashtag,
                    channel: channel.slice(1),
                    type: 'CHANNEL'
                });

                client.say(channel, `@${tags.username}, The hashtag ${hashtag} has been added.`);
                break;
            case "remove":
                if(!args[1]){
                    client.say(channel, `@${tags.username}, You need to provide a hashtag to remove.`);
                    return;
                }

                let removeHashtag = args[1];
                //check if they have the # symbol
                if(!removeHashtag.startsWith('#')){
                    removeHashtag = `#${removeHashtag}`;
                }

                const remove = await Hashtags.destroy({
                    where: {
                        hashtag: removeHashtag,
                        channel: channel.slice(1)
                    }
                });

                if(remove > 0){
                    client.say(channel, `@${tags.username}, The hashtag ${removeHashtag} has been removed.`);
                }else{
                    client.say(channel, `@${tags.username}, The hashtag ${removeHashtag} does not exist.`);
                }
                break;
            case "addGlobal":
                if(!args[1]){
                    client.say(channel, `@${tags.username}, You need to provide a hashtag to add.`);
                    return;
                }

                let globalHashtag = args[1];
                //check if they have the # symbol
                if(!globalHashtag.startsWith('#')){
                    globalHashtag = `#${globalHashtag}`;
                }

                if(hashtags.some(h => h.hashtag.toLowerCase() === globalHashtag.toLowerCase())){
                    client.say(channel, `@${tags.username}, The hashtag ${globalHashtag} already exists.`);
                    return;
                }

                await Hashtags.create({
                    hashtag: globalHashtag,
                    type: 'GLOBAL'
                });

                client.say(channel, `@${tags.username}, The hashtag ${globalHashtag} has been added.`);
                break;
            case "removeGlobal":
                if(!args[1]){
                    client.say(channel, `@${tags.username}, You need to provide a hashtag to remove.`);
                    return;
                }

                let removeGlobalHashtag = args[1];
                //check if they have the # symbol
                if(!removeGlobalHashtag.startsWith('#')){
                    removeGlobalHashtag = `#${removeGlobalHashtag}`;
                }

                const removeGlobal = await Hashtags.destroy({
                    where: {
                        hashtag: removeGlobalHashtag,
                        type: 'GLOBAL'
                    }
                });

                if(removeGlobal > 0){
                    client.say(channel, `@${tags.username}, The hashtag ${removeGlobalHashtag} has been removed.`);
                }else{
                    client.say(channel, `@${tags.username}, The hashtag ${removeGlobalHashtag} does not exist.`);
                }
                break;
            default:
                client.say(channel, `@${tags.username}, Invalid command. Usage: !hashtag [list|add|remove|addGlobal|removeGlobal]`);
                break;
        }
    }
}