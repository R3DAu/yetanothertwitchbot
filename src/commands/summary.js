const { OpenAI } = require("openai");
const {Op} = require('sequelize');
const Messages = require('../lib/database/models/messages');
const { getStreamInfo } = require('../lib/twitchAPI');

//set coolDown
let coolDown = false;
let startTime = null;

module.exports = {
    name: "summary",
    aliases: ['chat', 'chatsummary'],
    description: "This command provides a summary of the chat in the last 5 minutes. Usage: !summary",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //let's limit this command to moderators only.
        if(coolDown){
            //let the user know that the command is on cool down.
            //let's calculate the time remaining.
            const timeRemaining = Math.ceil((5 * 60 * 1000 - (Date.now() - startTime)) / 1000);
            //now let's make it human readable.
            const minutes = Math.floor(timeRemaining / 60);
            //now let's get the remaining seconds.
            const seconds = timeRemaining % 60;
            //finally let's send the message to the user.
            const msg = `@${tags.username}, The chat summary command is on cool down. ${minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}` : ''} ${seconds > 0 ? `${seconds} second${seconds > 1 ? 's' : ''}` : ''} remaining.`;

            client.say(channel, `@${tags.username}, ${msg}`);
            return;
        }

        startTime = Date.now();

        //set the cooldown to true
        coolDown = true;

        //set the cooldown to false after 5 minutes.
        setTimeout(() => {
            coolDown = false;
        }, 5 * 60 * 1000);

        const openai = new OpenAI({
            apiKey: process.env.CHATGPT_API_KEY
        });

        //let's get all the messages of the channel within a 5 minute window from the database.
        const messages = await Messages.findAll({
            where: {
                channel: channel.slice(1),
                createdAt: {
                    [Op.gte]: new Date(new Date() - 5 * 60 * 1000)
                }
            },
            order: [
                ['createdAt', 'ASC']
            ],
            raw: true
        });

        //we now need to create a prompt for the OpenAI API.
        const prompt = messages.map(m => `${m.username}: ${m.Message}`).join("\n");
        const streamInfo = await getStreamInfo(channel.slice(1));

        //we can't respond if the streamer is not live.
        if(!streamInfo){
            client.say(channel, `@${tags.username}, The streamer is not live.`);
            return;
        }

        //we want the stream title and the game being played.
        const streamTitle = streamInfo.title;
        const game = streamInfo.game_name;

        //let's generate a summary of the chat.
        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: `Imagine you are a commentator for a Twitch Streamer (${channel.slice(1)}) while they are playing: ${game} and the title of their stream is ${streamTitle}. Can you provide colourful commentary on the following chat messages (Without saying you're a commentator):` + prompt }],
            max_tokens: 150,
            temperature: 0.5,
        }).then((response) => {
            //let's give the usage into a console.
            console.log(`[INFO] Chat summary generated for ${channel.slice(1)}, Tokens used: ${response.total_tokens}, Tokens left: ${response.tokens_left}, Chat summary: ${response.choices[0].message.content}`);
            client.say(channel, `@${tags.username}, ${response.choices[0].message.content}`);
        })
        .catch(e => {
            console.error(`[ERROR] Unable to generate chat summary. ${e}`);
            client.say(channel, `@${tags.username}, I am unable to generate a chat summary at this time.`);
        });

    }
}