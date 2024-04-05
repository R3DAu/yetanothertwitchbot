const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Settings = sequelize.define('Settings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    value: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    type: {
        type: DataTypes.ENUM('GLOBAL', 'CHANNEL', 'USER'),
        allowNull: false,
    },
    options: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    channeluserid: {
        type: DataTypes.STRING,
        allowNull: true,
    }
});

module.exports = Settings;