const { startTime } = require('../../app');

module.exports = {
    name: "ping",
    aliases: ['test', 'pong'],
    description: "This command is used to test if the bot is online. Usage: !ping",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        //Calculate the uptime of the bot.
        const uptime = (Date.now() - startTime) / 1000;
        //make the uptime human readable.
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor(uptime % 3600 / 60);
        const seconds = Math.floor(uptime % 60);

        //we also want to get the memory usage of this node.js process.
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        const total = process.memoryUsage().heapTotal / 1024 / 1024;
        const rss = process.memoryUsage().rss / 1024 / 1024;
        const external = process.memoryUsage().external / 1024 / 1024;

        //now let's make the memory usage human readable.
        const memory = `Memory Usage: ${Math.round(used * 100) / 100}MB / ${Math.round(total * 100) / 100}MB (RSS: ${Math.round(rss * 100) / 100}MB, External: ${Math.round(external * 100) / 100}MB)`;

        //make the message human readable.
        const msg = `Bot has been online for ${days > 0 ? `${days} day${days > 1 ? 's' : ''}, ` : ''}${hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}, ` : ''}${minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}, ` : ''}${seconds > 0 ? `${seconds} second${seconds > 1 ? 's' : ''}` : ''}. ${memory}`;
        
        //send the message to the user.
        client.say(channel, `@${tags.username}, ${msg}`);
        
    }
}