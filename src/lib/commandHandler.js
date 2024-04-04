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
                if ('name' in command && 'execute' in command) {
                    commands.push(command);
                    console.log(`[INFO] Loaded command ${command.name}`);
                } else {
                    console.error(`[WARNING] The command at ${file} is missing a required "name" or "execute" property.`);
                   reject(`The command at ${file} is missing a required "name" or "execute" property.`);
                }
            }
            resolve(commands);
        }catch(e){
            reject(`Unable to load commands. ${e}`)
        }
    });
}

function hasCommand(command){
    return commands.some(c => c.name === command);
}

function getCommand(command){
    return commands.find(c => c.name === command);
}

module.exports = { getAllFiles, loadCommands, hasCommand, getCommand }

