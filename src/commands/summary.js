const { OpenAI } = require("openai");
const {Op} = require('sequelize');
const Messages = require('../lib/database/models/messages');
const { getStreamInfo } = require('../lib/twitchAPI');
const log = require('../lib/logger');

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
        const formattedMessages  = messages.map(m => `${m.username}: ${m.Message}`).join("\n");
        const streamInfo = await getStreamInfo(channel.slice(1));

        //we can't respond if the streamer is not live.
        if(!streamInfo){
            client.say(channel, `@${tags.username}, The streamer is not live.`);
            return;
        }

        // Construct the prompt.
        const streamTitle = streamInfo.title;
        const game = streamInfo.game_name;
        const prompt = `Imagine you are analyzing and summarizing a Twitch stream chat. The streamer is playing: ${game}, and the title of their stream is "${streamTitle}". Given the chat messages below, provide a summary and explain what happened during the stream based on these messages:\n\n${formattedMessages}`;

        //let's generate a summary of the chat.
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "system",
                content: "You are a virtual commentator analyzing Twitch chat messages. Provide a summary and interpretation."
            }, {
                role: "user",
                content: prompt
            }],
            temperature: 0.7,
            max_tokens: 512,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        }).then((response) => {
            //let's give the usage into a console.
            log.info(`[CHAT SUMMARY] ${tags.username} requested a chat summary.`, {service: "Command", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            client.say(channel, `@${tags.username}, ${response.choices[0].message.content}`);
        })
        .catch(e => {
            log.error(e, {service: "Command", pid: process.pid, channel: (process.env.channel)? process.env.channel : "Main"});
            client.say(channel, `@${tags.username}, I am unable to generate a chat summary at this time.`);
        });

    }
}