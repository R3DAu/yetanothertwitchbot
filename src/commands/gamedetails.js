const { getStreamInfo, getGameInfo } = require('../lib/twitchAPI');
const axios = require('axios');

module.exports = {
    name: "gamedetails",
    aliases: ['gd', 'game'],
    description: "This command is used to get the details of the game. Usage: !gamedetails",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //get the stream details
        const streamInfo = await getStreamInfo(channel);
        if(!streamInfo){
            client.say(channel, `@${tags.username}, The streamer is not live.`);
            return;
        }

        //get the game details
        const gameInfo = await getGameInfo(streamInfo.game_id);
        if(!gameInfo){
            client.say(channel, `@${tags.username}, The game details are not available.`);
            return;
        }

        client.say(channel, `@${tags.username}, ${channel} is playing ${gameInfo.name}. ${gameInfo.igdb.summary}`);
    }
}