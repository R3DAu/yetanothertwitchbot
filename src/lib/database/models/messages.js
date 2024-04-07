const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Messages = sequelize.define('Messages', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    channel: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    Message: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

module.exports = Messages;