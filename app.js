require('dotenv').config();
const cluster = require('cluster');
const path = require('path');
const tmi = require('tmi.js');
const {loadCommands, hasCommand, getCommand} = require("./src/lib/commandHandler");
const twitchChannels = process.env.TMI_CHANNELS.split(',');

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    const workers = [];

    // Fork workers.
    for (let i = 0; i < twitchChannels.length; i++) {
       workers[i] = cluster.fork({workerId: i, channel: twitchChannels[i]});
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);

        workers.forEach((w) => {
            if(w.state === 'dead'){
                console.log(`restarting worker ${w.process.pid}`);
                //overwrite the worker
                workers[ workers.indexOf(w) ] = cluster.fork({channel: twitchChannels[ workers.indexOf(w) ]});
            }
        });

    });
}else{
    //set user command cooldown
    const userCooldown = new Map();

    (async () => {
        const channel = process.env.channel;
        console.log(`Worker ${process.pid} started for channel ${channel}`);

        //load the commands
        await loadCommands(path.join(__dirname, '/src/commands')).catch((e) => console.error(e));

        //new client
        const client = new tmi.Client({
            options: { debug: process.env.TMI_DEBUG },
            identity: {
                username: process.env.TMI_USER,
                password: process.env.TMI_PASS
            },
            connection: {
                secure: true,
                reconnect: true
            },
            channels: [process.env.channel]
        });

        //connect the client
        await client.connect();

        client.on('connected', (addr, port) => {
            console.log(`* Connected to ${addr}:${port}`);
        });

        client.on('message', (channel, tags, message, self) => {
            // Ignore echoed messages.
            if(self) return;

            //check the usercooldown
            if(userCooldown.has(tags.username)){
                const lastUsed = userCooldown.get(tags.username);
                const diff = Date.now() - lastUsed;
                if(diff < 5000){
                    return;
                }
            }

            const args = message.slice(1).split(' ');
            const command = args.shift().toLowerCase();

            if(hasCommand(command)) {
                getCommand(command).execute(channel, tags, args, self, client);
            }
        });
    })();

    //make sure we handle the exit gracefully
    process.on('exit', (code) => {
        console.log(`Worker ${process.pid} stopped with exit code ${code}`);
    });
}




