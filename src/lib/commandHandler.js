const fs = require('node:fs');
const path = require('node:path');
const commands = [];

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
                    console.log(`[INFO] Loaded command ${command.name}`);
                } else {
                    console.error(`[WARNING] The command at ${file} is missing a required "name", "isModOnly", "description", "aliases" or "execute" property.`);
                   reject(`The command at ${file} is missing a required "name", "isModOnly", "description", "aliases" or "execute" property.`);
                }
            }
            resolve(commands);
        }catch(e){
            reject(`Unable to load commands. ${e}`)
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

