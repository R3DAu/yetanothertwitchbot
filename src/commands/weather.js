const { startTime } = require('../../app');

module.exports = {
    name: "weather",
    aliases: ['weather'],
    description: "This command is used to check the weather. Usage: !weather [Aus State]",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {
        const state = args[0] ?? 'VIC';

        //pull data from the API.
        const weather = await fetch(`https://axeapi.au/api/location/weather/${state}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer 486f77471b865ccc04e8d68645f95b2e99ff11bdedab6f94b05bbc7858336c31',
                'Content-Type': 'application/json',
            },
        }).then(response => response.json()).catch((e) => console.error(e));

        //make the message human readable.
        const msg = `The weather in ${state} has a temperature of ${weather.data.air_temp}°C and a humidity of ${weather.data.rel_hum}%. Wind Speed is currently: ${weather.data.wind_spd_kmh} km/h and the wind direction is ${weather.data.wind_dir}.`;

        //send the message to the user.
        client.say(channel, `@${tags.username}, ${msg}`);
    }
}