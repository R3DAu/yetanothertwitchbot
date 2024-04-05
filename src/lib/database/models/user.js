const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const User = sequelize.define('User', {
    twitchId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    accessToken: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    refreshToken: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    permissions: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    login: {
        type: DataTypes.STRING,
        allowNull: false,
    }
});

module.exports = User;