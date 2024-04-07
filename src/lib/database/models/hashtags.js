const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Hashtags = sequelize.define('Hashtags', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    hashtag: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    channel: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    type: {
        type: DataTypes.ENUM('GLOBAL', 'CHANNEL'),
        allowNull: false,
    },
});

module.exports = Hashtags;