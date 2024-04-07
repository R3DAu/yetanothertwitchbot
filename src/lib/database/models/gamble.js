const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Gamble = sequelize.define('Gamble', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    channel: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    user: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
});

module.exports = Gamble;