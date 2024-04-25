const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const fishCaught = sequelize.define('fishCaught', {
    idfishCaught: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    channel: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fishName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    timesCaught: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
});

module.exports = fishCaught;