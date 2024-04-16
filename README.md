# Yet Another Twitch Bot (YATB)
![GitHub top language](https://img.shields.io/github/languages/top/R3DAu/yetanothertwitchbot)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/R3DAu/yetanothertwitchbot/main.yml)
![GitHub commit activity](https://img.shields.io/github/commit-activity/w/R3DAu/yetanothertwitchbot)
![GitHub last commit](https://img.shields.io/github/last-commit/R3DAu/yetanothertwitchbot)
![GitHub package.json version](https://img.shields.io/github/package-json/v/R3DAu/yetanothertwitchbot)
[![wakatime](https://wakatime.com/badge/user/5c369e66-4117-4964-ac95-c272b21de546/project/018eab80-98d1-47c0-9a3f-f8e2c219ebda.svg)](https://wakatime.com/badge/user/5c369e66-4117-4964-ac95-c272b21de546/project/018eab80-98d1-47c0-9a3f-f8e2c219ebda)

YATB is a simple Twitch bot that can be used to interact with your viewers, it allows you to configure custom commands, scripts and even has an inbuilt web server to let your streamers manage their channels. 

YATB is still in development. If you have any suggestions or issues, please let me know.

## Features
- Default inbuilt commands
  - `!balance` - This command is used to check your balance
  - `!blackjack` - This command is used to play blackjack
  - `!chathistory` - This command is used to check the chat history of a user
  - `!description` - Shows the description of all available commands
  - `!flip` - This command is used to flip a coin
  - `!gamedetails` - This command is used to check the details of the currently active game
  - `!hashtag` - This command is a fun utility that generates a random hashtag or adds a hashtag to the channel.
  - `!ping` - This command is used to check if the bot is alive
  - `!settings` - This command is used to check and set the settings of the bot
  - `!summary` - This command provides a summary of the chat in the last 5 minutes.
  - `!version` - This command is used to check the version and summary of the bot
- Custom commands
- Custom scripts
- Web server
- Fully clustered setup with a master and worker nodes (channels are load-balanced across the workers)
- Customizable settings per channel

## Installation
1. Clone the repository
2. Run `npm install`
3. Create a `.env` file in the root directory and use the following template (found in `.env.template`)
4. Run `npm start`

or install via docker:
1. pull from github repository `docker pull ghcr.io/R3DAu/yatb:latest`
2. create a `.env` file in the root directory and use the following template (found in `.env.template`)
3. run `docker run --env-file .env ghcr.io/R3DAu/yatb:latest --name yatb --ports 3000:3000`

## Configuration
The configuration is done via the `.env` file.

