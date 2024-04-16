const Messages = require('../lib/database/models/messages');
const { Op } = require('sequelize');
const moment = require('moment');

module.exports = {
    name: "chathistory",
    aliases: ['history'],
    description: "This command provides the chat history of a user in the channel. Usage: !chathistory <username> <limit> <date> <channel> <page>",
    isModOnly: true,
    async execute(channel, tags, args, self, client) {
        const username = args[0]?.toLowerCase() || tags.username.toLowerCase();
        const limit = parseInt(args[1]) || 10;
        const dateInput = args[2];
        const date = dateInput ? new Date(Date.parse(dateInput)) : new Date();
        const dateString = date.toISOString().substring(0, 10);
        const chan = args[3] || channel;
        const page = parseInt(args[4]) || 1;

        const offset = (page - 1) * limit;

        const messages = await Messages.findAll({
            where: {
                channel: chan,
                username: username,
                createdAt: {
                    [Op.gte]: new Date(dateString),
                    [Op.lt]: new Date(new Date(dateString).setDate(date.getDate() + 1))
                }
            },
            order: [['createdAt', 'ASC']],
            limit: limit,
            offset: offset,
            raw: true
        });

        if (messages.length === 0) {
            client.say(channel, `@${tags.username}, no messages found for ${username}.`);
            return;
        }

        // Formatting messages
        let response = messages.map(m => `${moment(m.createdAt).format('HH:mm:ss')}: ${m.Message}`).join(' | ');

        client.say(channel, `@${tags.username}, Page ${page} of chat history for ${username}: ${response}`);
        setTimeout(() => {
            client.say(channel, `Use !chathistory ${username} ${limit} ${dateInput || dateString} ${chan} ${page + 1} to see more.`);
        }, 2000);
    }
}