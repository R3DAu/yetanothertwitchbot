require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    define:{
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    dialect: 'mysql',
    dialectOptions: {

        connectTimeout: process.env.DB_CONNECTION_TIMEOUT || 1000,
        connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
    },
    logging: process.env.APP_ENV === 'production' ? false : console.log
});

/** try the connection */
async function connect() {
    return new Promise(async (resolve, reject) => {
        try {
            await sequelize.authenticate();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { Sequelize, sequelize, connect };