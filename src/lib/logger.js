const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { combine, timestamp, printf, colorize, align, json } = winston.format;

const log = winston.createLogger({
    level: process.env.APP_ENV === 'production' ? 'info' : 'debug',

    defaultMeta: { service: 'Main' },
    transports: [
        new winston.transports.File({ filename: path.join(__dirname, '../', '../', 'logs/error.log'), level: 'error', format: combine(timestamp(), json()), }),
        new winston.transports.File({ filename: path.join(__dirname, '../', '../', 'logs/combined.log'), format: combine(timestamp(), json()), }),
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                timestamp(),
                align(),
                printf((info) => `[${info.timestamp}] [${(info.pid)? info.pid : "" }] [${(info.channel)? info.channel : "Main" }] [${(info.service)? info.service : "Main" }] ${info.level}: ${info.message}`)
            ),
        })
    ],
});

module.exports = log;
