const fs = require('node:fs');
const path = require('node:path');
const commands = [];
const log = require('./logger');

async function getAllFiles(dir) {
    return fs.readdirSync(dir).reduce((files, file) => {
        const name = path.join(dir, file);
        const isDirectory = fs.statSync(name).isDirectory();
        if(isDirectory || file.endsWith('.js'))
            return isDirectory ? [...files, ...getAllFiles(name)] : [...files, name];
    }, []);
} 

async function loadCommands(dir) {
    return new Promise(async (resolve, reject) => {
        try{
            for (const file of await getAllFiles(dir)) {
                const command = require(file);
                if ('name' in command && 'execute' in command && 'isModOnly' in command && 'description' in command && 'aliases' in command && typeof command.execute === 'function') {
                    commands.push(command);
                    log.info(`Loaded command ${command.name}`, {service: 'Command Handler', pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"})
                } else {
                    log.error(`[WARNING] The command at ${file} is missing a required "name", "isModOnly", "description", "aliases" or "execute" property.`, {service: 'Command Handler', pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
                    reject(`The command at ${file} is missing a required "name", "isModOnly", "description", "aliases" or "execute" property.`);
                }
            }
            log.info(`Loaded ${commands.length} commands.`, {service: 'Command Handler', pid: process.pid, channel: (process.env.channels)? process.env.channels : "Main"});
            resolve(true);
        }catch(e){
            reject(`Unable to load commands file ${dir}. ${e}`)
        }
    });
}

function hasCommand(command){
    //check if the command exists or if the alias exists.
    return commands.some(c => c.name === command) || commands.some(c => c.aliases.includes(command));
}

function getCommand(command){
    //return the command, or the first alias that matches the command.
    return commands.find(c => c.name === command) || commands.find(c => c.aliases.includes(command));
}

module.exports = { commands, getAllFiles, loadCommands, hasCommand, getCommand }

