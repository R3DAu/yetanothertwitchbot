const axios = require('axios');
require('dotenv').config();

/* lets get the access token */
let accessToken = null;
let tokenExpires = null;

async function getAccessToken() {
    if (accessToken && tokenExpires > Date.now()) {
        return accessToken;
    }

    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: process.env.TMI_CLIENT_ID,
            client_secret: process.env.TMI_CLIENT_SECRET,
            grant_type: 'client_credentials'
        }
    });

    accessToken = response.data.access_token;
    tokenExpires = Date.now() + (response.data.expires_in * 1000);

    return accessToken;
}

async function getChannelInfo(channel) {
    const token = await getAccessToken();

    const response = await axios.get(`https://api.twitch.tv/helix/users?login=${channel}`, {
        headers: {
            'Client-ID': process.env.TMI_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data.data[0];
}

//get the stream information
async function getStreamInfo(channel) {
    const token = await getAccessToken();

    const response = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
        headers: {
            'Client-ID': process.env.TMI_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data.data[0];
}

//get game information
async function getGameInfo(gameId) {
    const token = await getAccessToken();

    const response = await axios.get(`https://api.twitch.tv/helix/games?id=${gameId}`, {
        headers: {
            'Client-ID': process.env.TMI_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });

    const igdbResponse = await axios.post(
        'https://api.igdb.com/v4/games',
        `fields *; where id = ${response.data.data[0].igdb_id}; limit 1;`,
        {
            headers: {
                'Accept': 'application/json',
                'Client-ID': process.env.TMI_CLIENT_ID, // Use the same Client ID for Twitch
                'Authorization': `Bearer ${token}` // IGDB Access Token
            }
        }
    );

    console.log(igdbResponse);
    response.data.data[0].igdb = igdbResponse.data[0];
    return response.data.data[0];
}

module.exports = { getChannelInfo, getStreamInfo, getGameInfo};