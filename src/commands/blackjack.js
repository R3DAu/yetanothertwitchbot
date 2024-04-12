const Gamble = require('../lib/database/models/gamble');
// Track games by channel or user to prevent collisions in multi-user environments
let games = {};

function createDeck() {
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
    const deck = [];

    for (let suit of suits) {
        for (let rank of ranks) {
            deck.push({ rank, suit, value: getValue(rank) });
        }
    }

    return shuffle(deck);
}

function getValue(rank) {
    if (['Jack', 'Queen', 'King'].includes(rank)) {
        return 10;
    } else if (rank === 'Ace') {
        return 11; // Ace can also be 1, but we'll handle that later
    } else {
        return parseInt(rank);
    }
}

// Implementing Fisher-Yates Shuffle
function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]; // Swap
    }
    return deck;
}

function dealInitialCards(deck) {
    return [deck.pop(), deck.pop()]; // Deal two cards
}

function dealCard(deck) {
    return deck.pop(); // Deal one card
}

function calculateScore(hand) {
    let score = hand.reduce((acc, card) => acc + card.value, 0);
    let aces = hand.filter(card => card.rank === 'Ace').length;

    // Adjusting the Ace value from 11 to 1 if total score exceeds 21
    while (score > 21 && aces > 0) {
        score -= 10; // Subtracting 10 as one Ace changes from 11 to 1
        aces -= 1;
    }

    return score;
}

function dealerAction(deck, dealerHand) {
    // Dealer rules can vary, but a common rule is to hit until reaching a score of 17 or more
    while (calculateScore(dealerHand) < 17) {
        dealerHand.push(dealCard(deck));
    }
}

function determineWinner(playerHand, dealerHand) {
    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(dealerHand);

    if (playerScore > 21) {
        return 'Dealer';
    } else if (dealerScore > 21 || playerScore > dealerScore) {
        return 'Player';
    } else if (dealerScore > playerScore) {
        return 'Dealer';
    } else {
        return 'Push'; // Tie
    }
}

// Function to start a new game
async function startBlackjackGame(client, channel, tags, betAmount) {
    if (games[channel]) {
        client.say(channel, `@${tags.username}, a game is already in progress.`);
        return;
    }

    const deck = createDeck();
    const playerHand = dealInitialCards(deck);
    const dealerHand = dealInitialCards(deck);

    games[channel] = {
        username: tags.username,
        deck,
        playerHand,
        dealerHand,
        betAmount,
        status: 'waitingForPlayer' // Game is waiting for player to hit or stand
    };

    displayHand(client, channel, 'Your', playerHand);
    client.say(channel, `@${tags.username}, use the commands hit to take another card or stand to hold.`);
}

// Function to display a hand
function displayHand(client, channel, owner, hand) {
    const handStr = hand.map(card => `${card.rank} of ${card.suit}`).join(', ');
    const score = calculateScore(hand);
    client.say(channel, `@${games[channel].username}, ${owner} hand: ${handStr}. Score: ${score}`);
}

// Handle commands for hitting or standing
async function handlePlayerDecision(client, channel, command, tags) {
    const game = games[channel];
    if (!game || game.status !== 'waitingForPlayer') return;

    if (command === 'hit') {
        game.playerHand.push(dealCard(game.deck));
        const score = calculateScore(game.playerHand);
        displayHand(client, channel, 'Your', game.playerHand);

        if (score >= 21) {
            concludeGame(client, channel, tags.username, game.betAmount);
        }
    } else if (command === 'stand') {
        game.status = 'dealerTurn';
        concludeGame(client, channel, tags.username, game.betAmount);
    }
}

// Conclude the game
async function concludeGame(client, channel, username, amount) {
    const game = games[channel];
    if (!game) return;

    if (game.status === 'dealerTurn') {
        dealerAction(game.deck, game.dealerHand);
        displayHand(client, channel, "Dealer's", game.dealerHand);
    }

    const result = determineWinner(game.playerHand, game.dealerHand);
    // Handle bet outcomes and communicate result...
    // Remember to clear the game state afterwards

    // Check the user's balance
    const balance = await Gamble.findOrCreate({
        where: {
            channel: channel.slice(1),
            user: username
        },
        defaults: {
            amount: 100
        },
        raw: true
    });

    if (result === 'Player') {
        // Player wins
        await Gamble.update({
            amount: balance[0].amount + (amount * 2)
        }, {
            where: {
                channel: channel.slice(1),
                user: username
            }
        });

        client.say(channel, `@${username}, Congratulations! You won ${amount * 2}!`);
    }

    if (result === 'Dealer') {
        // Dealer wins
        client.say(channel, `@${username}, Dealer wins!`);
    }

    if (result === 'Push') {
        // Tie
        await Gamble.update({
            amount: balance[0].amount + amount
        }, {
            where: {
                channel: channel.slice(1),
                user: username
            }
        });

        client.say(channel, `@${username}, It's a tie! You get your bet amount back.`);
    }

    games[channel] = null; // Or delete games[channel];
}


module.exports = {
    name: "blackjack",
    aliases: ['bj', '21'],
    description: "This command is used to play blackjack. Usage: !blackjack <amount>",
    isModOnly: false,
    async execute(channel, tags, args, self, client) {

        //get commands
        const command = args[0]?.toLowerCase();
        switch(command){
            case 'hit':
            case 'stand':
                await handlePlayerDecision(client, channel, command, tags);
                return;
            default:
                if (args.length < 1) {
                    client.say(channel, `@${tags.username}, You need to provide a bet amount or a command <hit/stand>.`);
                    return;
                }

                const amount = parseInt(args[0]);

                if (isNaN(amount) || amount <= 0) {
                    client.say(channel, `@${tags.username}, Please enter a valid bet amount.`);
                    return;
                }

                // Check the user's balance
                const balance = await Gamble.findOrCreate({
                    where: {
                        channel: channel.slice(1),
                        user: tags.username
                    },
                    defaults: {
                        amount: 100
                    },
                    raw: true
                });

                if (balance[0].amount < amount) {
                    client.say(channel, `@${tags.username}, You do not have enough balance to place this bet.`);
                    return;
                }

                // Deduct the bet amount from the user's balance
                await Gamble.update({
                    amount: balance[0].amount - amount
                }, {
                    where: {
                        channel: channel.slice(1),
                        user: tags.username
                    }
                });

                //setup the game here:
                await startBlackjackGame(client, channel, tags, amount);
        }
    }
}