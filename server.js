const { Telegraf, Markup, Scenes, session } = require('telegraf')
const mysql = require('mysql2/promise');
var config = require('./dbConfig')
var moment = require('moment');
const { min } = require('moment');
const axios = require('axios').default;
const schedule = require('node-schedule');
var crypto = require("crypto");


const BOT_TOKEN = 'hidden'; //NEW TOKEN
const SPORT_TOKEN = 'hidden'

const bot = new Telegraf(BOT_TOKEN)

const enterPromo = require('./scenes/enterPromo')
const buySub = require('./scenes/buySubCrypto')
const buySubCard = require('./scenes/buySubCard')

var botMenu = [
    ['⏱ Trial status', '⚽️ Trial Daily Tips'],
    ['🏆 VIP Tips', '💰 VIP Subscription'],
    ['🤝 Referral system', '✅ Support'],
]

var referralMenu = [
    ['👥 Get referral promo', '✅ Enter referral promo'],
    ['↩ Back']
]

var subBuy = [
    ['💸 Buy a subscription'],
    ['↩ Back'],
]

var payMethodMenu = [
    ['🪙 Crypto', '💳 Debit Card'],
    ['↩ Back'],
]

var valute = [
    ['NGN', 'USDC'],
    ['USDT', 'BUSD'],
    ['↩ Back']
]

async function writeNewData(telegramID, chatID) {
    /*bot.telegram.sendMessage(chatID, 'Test msg') */

    const conn = await mysql.createConnection(config);
    conn.connect();
    const [rows] = await conn.execute('SELECT * FROM `users` WHERE `telegram_id` = "' + telegramID + '"')
    user = rows;

    if (user[0].chatid === null) {
        conn.query('UPDATE `users` SET `chatid` = "' + chatID + '" WHERE `users`.`telegram_id` = "' + telegramID + '";')
    }

    closeConnection(conn)
}

const stage = new Scenes.Stage([enterPromo, buySub, buySubCard]);
bot.use(session());
bot.use(stage.middleware())

/* FUNCTIONS */

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function closeConnection(conn) {
    conn.end(function(err) {
        if (err) {
            return console.log('error:' + err.message);
        }
        console.log('Close the database connection.');
    });
}

async function addUserToDatabase(userID) {
    const conn = await mysql.createConnection(config);
    conn.connect();
    const [rows] = await conn.execute('SELECT * FROM `users` WHERE `telegram_id` = "' + userID + '"')
    user = rows;

    if (user.length == 0) {
        var [trialTime] = await conn.execute('SELECT `trial_days` FROM `bot_settings`')
        trialTime = trialTime[0].trial_days;
        var now = moment();
        var trialEndingDate = now.add(Number(trialTime) - 1, 'days');
        let promocode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const [rows] = await conn.execute('SELECT `promocode` FROM `promocodes`')
        var promocodes = [rows]

        var regDate = moment()

        if (promocodes.indexOf(promocode) == -1) {
            conn.query('INSERT INTO `users` (`id`, telegram_id, trial_ending_date, sub_status, sub_ending_date, reg_date) VALUES ("0", "' + userID + '", "' + trialEndingDate + '", "0", "NULL", "' + regDate + '");')
            conn.query('INSERT INTO `promocodes` (`id`, telegram_id, promocode) VALUES ("0", "' + userID + '", "' + promocode + '");')

        } else {
            let promocode = crypto.randomBytes(3).toString('hex').toUpperCase();
            conn.query('INSERT INTO `users` (`id`, telegram_id, trial_ending_date, sub_status, sub_ending_date, reg_date) VALUES ("0", "' + userID + '", "' + trialEndingDate + '", "0", "NULL", "' + regDate + '");')
            conn.query('INSERT INTO `promocodes` (`id`, telegram_id, promocode) VALUES ("0", "' + userID + '", "' + promocode + '");')
        }


        closeConnection(conn)
        return ([trialEndingDate, trialTime])

    } else {
        closeConnection(conn)
        return (['userInDB', 'NULL'])
    }
}

async function getTrialTime(userID) {
    const conn = await mysql.createConnection(config);
    conn.connect();
    const [rows] = await conn.execute('SELECT `trial_ending_date` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    time = rows[0].trial_ending_date;

    var now = moment();
    var end = moment(Number(time));
    var time = end.diff(now);
    var minutes = end.diff(now, 'minutes');

    if (minutes > 0) {
        var date = new String(moment.utc(time).format('D') + ' Days, ' + moment.utc(time).format('HH') + ' Hours, ' + moment.utc(time).format('mm') + ' Minutes')
        return (date)
    } else {
        return ('Ended')
    }
}

async function getRandomPredict(userID) {

    const conn = await mysql.createConnection(config);
    conn.connect();
    var [userPredictions] = await conn.execute('SELECT `showed_predictions` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    userPredictions = userPredictions[0].showed_predictions;
    console.log(userPredictions)
    var stringPrediction = userPredictions;

    if (userPredictions == null) {
        userPredictions = []
        stringPrediction = ''
    } else {
        userPredictions = userPredictions.split(',');
    }

    return new Promise(async(resolve, reject) => {
        let data;

        var now = moment().format('YYYY-MM-DD')
        var end = moment().add(2, 'd').format('YYYY-MM-DD')
        var config = {
            method: 'GET',
            url: `https://soccer.sportmonks.com/api/v2.0/fixtures/between/${now}/${end}?api_token=${SPORT_TOKEN}&include=localTeam,visitorTeam&status=NS`,
            headers: {}
        };

        await axios(config)
            .then(async function(response) {

                res = response.data.data;
                userPredictions.forEach(element => {
                    if (res.find(el => Number(el.id) == Number(element)) != undefined) {
                        var index = res.map(function(item) {
                            return item.id;
                        }).indexOf(Number(element));
                        res.splice(index, 1);
                    }
                });

                response = res
                if (Object.keys(response).length == 0) {
                    data = ['no_predicts']
                    closeConnection(conn)
                } else {
                    var matchCount = Object.keys(response).length
                    const number = getRandomInt(matchCount)
                    var predictID = response[number].id
                    data = [predictID, response[number].localteam_id, response[number].visitorteam_id, response[number].time.starting_at.date_time, response[number].league_id]
                    stringPrediction = stringPrediction.concat(',', predictID)
                    conn.query('UPDATE `users` SET `showed_predictions` = "' + stringPrediction + '" WHERE `telegram_id` = "' + userID + '" ;')
                    closeConnection(conn)
                }
            })
            .catch(function(error) {
                console.log(error);
            });

        resolve(data)
    });
}

async function getTeamInfo(ID) {
    return new Promise(async(resolve, reject) => {
        let teamName;

        var config = {
            method: 'GET',
            url: `https://soccer.sportmonks.com/api/v2.0/teams/${ID}?api_token=${SPORT_TOKEN}`,
            headers: {}
        };

        await axios(config)
            .then(async function(response) {
                teamName = response.data.data.name
            })
            .catch(function(error) {
                console.log(error);
            });

        resolve(teamName)
    });
}

async function getPredictByID(info) {
    return new Promise(async(resolve, reject) => {
        let data = [];
        var config = {
            method: 'GET',
            url: `https://soccer.sportmonks.com/api/v2.0/predictions/probabilities/fixture/${info[0]}/?api_token=${SPORT_TOKEN}`,
            headers: {}
        };

        await axios(config)
            .then(async function(response) {
                var predictions = new Set([response.data.data.predictions]);
                data = {
                    info: [{
                        homeTeam: '',
                        visitorTeam: ''
                    }],
                    predict: [

                    ]
                }

                predictions = Array.from(predictions).slice(0, 15)
                await data.predict.push(predictions)

                /* GET HOME TEAM NAME */

                const homeTeam = getTeamInfo(info[1])

                await homeTeam.then(function(homeTeamName) {
                    data.info[0].homeTeam = homeTeamName
                })

                /* GET VISITOR TEAM NAME */

                const visitorTeam = getTeamInfo(info[2])

                await visitorTeam.then(function(visitorTeamName) {
                    data.info[0].visitorTeam = visitorTeamName
                })

            })
            .catch(function(error) {
                console.log(error);
            });

        resolve(data)
    });
}

async function getBotSettings(userID) {
    const conn = await mysql.createConnection(config);
    conn.connect();
    const [rows] = await conn.execute('SELECT * FROM `bot_settings` WHERE `id` = "' + 1 + '"')
    var [userPredictions] = await conn.execute('SELECT `showed_predictions` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    settings = rows[0];
    userPredictions = userPredictions[0].showed_predictions;

    if (userPredictions == null) {
        userPredictions = []
    } else {
        userPredictions = userPredictions.split(',');
    }
    return [settings, userPredictions];

}

async function getLeagueName(league_id) {
    return new Promise(async(resolve, reject) => {
        let leagueName = [];
        var config = {
            method: 'GET',
            url: `https://soccer.sportmonks.com/api/v2.0/leagues/${league_id}?api_token=${SPORT_TOKEN}`,
            headers: {}
        };

        await axios(config)
            .then(async function(response) {


                /* GET COUNTRY NAME */

                var countryConfig = {
                    method: 'GET',
                    url: `https://soccer.sportmonks.com/api/v2.0/countries/${response.data.data.country_id}?api_token=${SPORT_TOKEN}`,
                    headers: {}
                };

                await axios(countryConfig)
                    .then(async function(country) {


                        leagueName.push({
                            name: response.data.data.name,
                            country: country.data.data.name
                        })

                    }).catch(function(error) {
                        console.log(error);
                    });


            })
            .catch(function(error) {
                console.log(error);
            });
        resolve(leagueName)
    });

}

async function getBestValues(matchID) {
    return new Promise(async(resolve, reject) => {
        let data = [{
                team1Win: [],
                teamXWin: [],
                team2Win: []
            }

        ];
        var config = {
            method: 'GET',
            url: `https://soccer.sportmonks.com/api/v2.0/odds/fixture/${matchID}/?api_token=${SPORT_TOKEN}`,
            headers: {}
        };

        await axios(config)
            .then(async function(response) {

                var bookmakersList = response.data.data[0].bookmaker.data;

                /* TEAM 1 WIN */

                bookmakersList = bookmakersList.sort((a, b) => Number(a.odds.data[0].value) - Number(b.odds.data[0].value));
                const sortedByT1 = bookmakersList.reverse();
                data[0].team1Win.push({
                    bookmakerName: sortedByT1[0].name,
                    value: sortedByT1[0].odds.data[0].value
                })

                /* TEAM X WIN */

                bookmakersList = bookmakersList.sort((a, b) => Number(a.odds.data[1].value) - Number(b.odds.data[1].value));
                const sortedByTX = bookmakersList.reverse();
                data[0].teamXWin.push({
                    bookmakerName: sortedByTX[1].name,
                    value: sortedByTX[1].odds.data[1].value
                })

                /* TEAM 2 WIN */

                bookmakersList = bookmakersList.sort((a, b) => Number(a.odds.data[2].value) - Number(b.odds.data[2].value));
                const sortedByT2 = bookmakersList.reverse();
                data[0].team2Win.push({
                    bookmakerName: sortedByT2[2].name,
                    value: sortedByT2[2].odds.data[2].value
                })
            })
            .catch(function(error) {
                console.log(error);
            });
        resolve(data)
    });
}

async function getSubStatus(userID) {
    const conn = await mysql.createConnection(config);
    conn.connect();
    const [subtime] = await conn.execute('SELECT `sub_ending_date` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    const [rows] = await conn.execute('SELECT `sub_status` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    var subStatus = rows[0].sub_status;
    var subTime = subtime[0].sub_ending_date

    var now = moment();
    var end = moment(Number(subTime));
    var time = end.diff(now);
    var minutes = end.diff(now, 'minutes');

    if (minutes > 0) {
        return (1)
    } else {
        conn.query('UPDATE `users` SET `sub_status` = "0" WHERE `users`.`telegram_id` = "' + userID + '";')
        return (null)
    }
}

/* BOT LOGIC */

bot.start(async(ctx) => {
    try {

        let userID = ctx.message.from.id;
        const addUser = addUserToDatabase(userID)

        addUser.then(function(result) {
            if (result[0] != 'userInDB') {
                ctx.replyWithHTML(`Hello ${ctx.message.from.first_name}! Welcome to Global Predict You have a trial period of access to bets and predictions which will end in ` + result[1] + ` days.`, Markup.keyboard(botMenu).resize())

            } else {

                const trialTime = getTrialTime(userID)

                trialTime.then(function(result) {
                    if (result != 'Ended') {
                        ctx.replyWithHTML(`Hello ${ctx.message.from.first_name}! You have a trial period of access to bets and predictions which will end in <code>` + result + `</code>.`, Markup.keyboard(botMenu).resize())
                    } else {
                        ctx.replyWithHTML(`Hello ${ctx.message.from.first_name}! What are your interests?`, Markup.keyboard(botMenu).resize())
                        ctx.reply('Your trial time is over!', Markup.keyboard(botMenu).resize())
                    }
                })


            }
        })
    } catch (error) {
        console.log(error)
    }
})

bot.hears('⏱ Trial status', async(ctx) => {
    try {
        let userID = ctx.message.from.id;

        writeNewData(userID, ctx.message.chat.id)

        const trialTime = getTrialTime(userID)

        trialTime.then(function(result) {
            if (result != 'Ended') {
                ctx.replyWithHTML('Trial period time remaining: <code>' + result + '</code>', Markup.keyboard(botMenu).resize())
            } else {
                ctx.reply('Your trial time is over!', Markup.keyboard(botMenu).resize())
            }
        })
    } catch (error) {
        console.log(error)
    }
})

bot.hears('⚽️ Trial Daily Tips', async(ctx) => {
    try {
        let userID = ctx.message.from.id;
        const trialTime = getTrialTime(userID)

        trialTime.then(function(time) {
            if (time != 'Ended') {

                const checkPredictLimit = getBotSettings(userID)
                checkPredictLimit.then(async function(settingsInfo) {
                    var usedCount = Object.keys(settingsInfo[1]).length - 1

                    if (usedCount < settingsInfo[0].max_trial_predict + 1) {
                        const randomPredictID = getRandomPredict(userID)

                        randomPredictID.then(function(result) {
                            if (result != undefined) {
                                if (result[0] == 'no_predicts') {
                                    ctx.reply('There are currently no predictions available!', Markup.keyboard(botMenu).resize())
                                } else {
                                    const predict = getPredictByID([result[0], result[1], result[2]])

                                    var matchID = result[0]
                                    var date = result[3]
                                    var leagueID = result[4]

                                    predict.then(function(predictData) {
                                        var info = predictData.info[0];
                                        var predict = predictData.predict[0][0]

                                        const leagueName = getLeagueName(leagueID)

                                        leagueName.then(async function(leagueName) {
                                            var predictMessage = `<b>Match: ${info.homeTeam} - ${info.visitorTeam}</b> \n<b>Date & Time:</b> <i>${date}</i> \n<b>League name:</b> ${leagueName[0].name}\n<b>Country:</b> ${leagueName[0].country}\n\n<b>Both teams to score:</b> <code>${predict.btts + '%'}</code>  \n<b>Over 2.5:</b> <code>${predict.over_2_5 + '%'}</code>  \n<b>Under 2.5:</b> <code>${predict.under_2_5 + '%'}</code>  \n<b>Over 3.5:</b> <code>${predict.over_3_5 + '%'}</code>  \n<b>Under 3.5:</b> <code>${predict.under_3_5 + '%'}</code>  \n<b>Half time over 0.5:</b> <code>${predict.HT_over_0_5 + '%'}</code>  \n<b>Half-time under 0.5:</b> <code>${predict.HT_under_0_5 + '%'}</code>  \n<b>Half time over 1.5:</b> <code>${predict.HT_over_1_5 + '%'}</code>  \n<b>Half time under 1.5:</b> <code>${predict.HT_under_1_5 + '%'}</code>  \n<b>AT over 0.5:</b> <code>${predict.AT_over_0_5 + '%'}</code>  \n<b>AT under 0.5:</b> <code>${predict.AT_under_0_5 + '%'}</code>  \n<b>AT over 1.5:</b> <code>${predict.AT_over_1_5 + '%'}</code>  \n<b>AT under 1.5:</b> <code>${predict.AT_under_1_5 + '%'}</code>  \n<b>Home win:</b> <code>${predict.home + '%'}</code>  \n<b>Away win:</b> <code>${predict.away + '%'}</code>  \n<b>Draw:</b> <code>${predict.draw + '%'}</code>  \n`
                                            ctx.replyWithHTML(predictMessage)

                                            /* BETS */

                                            const bestValues = getBestValues(matchID)

                                            await bestValues.then(async function(value) {
                                                var betsValueMessage = `<b>Best bookmakers for this match:</b> \n\n<b>Bookmaker:</b> ${value[0].team1Win[0].bookmakerName} | Team 1 Win: <code>${value[0].team1Win[0].value}</code>\n<b>Bookmaker:</b> ${value[0].teamXWin[0].bookmakerName} | X: <code>${value[0].teamXWin[0].value}</code>\n<b>Bookmaker:</b> ${value[0].team2Win[0].bookmakerName} | Team 2 Win: <code>${value[0].team2Win[0].value}</code>\n`
                                                await ctx.replyWithHTML(betsValueMessage)
                                            })

                                        })
                                    })
                                }
                            } else {
                                ctx.replyWithHTML(`An unknown error has occurred. Please try again`)
                            }
                        })
                    } else {
                        ctx.replyWithHTML(`Sorry, you have used the maximum number of free predictions for the day.`)
                    }
                })

            } else {
                ctx.reply('The trial period has ended. Subscribe now to receive VIP access, which includes unlimited bets and predictions for 30 days.', Markup.keyboard(botMenu).resize())
            }
        })

    } catch (error) {
        console.log(error)
    }
})


/* REFERRAL SYSTEM */

bot.hears('🤝 Referral system', async(ctx) => {
        try {
            let userID = ctx.message.from.id;
            await ctx.reply('Choose what you want to do:', Markup.keyboard(referralMenu).resize())
        } catch (error) {
            console.log(error)
        }
    })
    //['👥 Get referral promo', '✅ Enter referral promo'],

bot.hears('👥 Get referral promo', async(ctx) => {
    try {
        let userID = ctx.message.from.id;
        const conn = await mysql.createConnection(config);
        conn.connect();
        const [rows] = await conn.execute('SELECT `promocode` FROM `promocodes` WHERE `telegram_id` = "' + userID + '"')
        promocode = rows[0].promocode;
        await ctx.replyWithHTML(`<b>Your referral promo code:</b> <code>${promocode}</code>`, Markup.keyboard(botMenu).resize())
    } catch (error) {
        console.log(error)
    }
})

bot.hears('✅ Enter referral promo', async(ctx) => {
    try {
        let userID = ctx.message.from.id;

        const conn = await mysql.createConnection(config);
        conn.connect();
        const [rows] = await conn.execute('SELECT `is_promo_used` FROM `users` WHERE `telegram_id` = "' + userID + '"')
        isPromoUsed = rows[0].is_promo_used;

        if (isPromoUsed != 'true') {
            ctx.scene.enter('enterPromo')
        } else {
            await ctx.reply('You have already used the referral system! You can enter the promo code only once.', Markup.keyboard(botMenu).resize())
        }

    } catch (error) {
        console.log(error)
    }
})

/* VIP */

bot.hears('🏆 VIP Tips', async(ctx) => {
    try {
        let userID = ctx.message.from.id;

        const subStatus = getSubStatus(userID)
        subStatus.then(function(result) {

            if (result == 1) {
                const predict = getRandomPredict(userID)

                predict.then(function(result) {
                    if (result != undefined) {
                        if (result[0] == 'no_predicts') {
                            ctx.reply('There are currently no predictions available!', Markup.keyboard(botMenu).resize())
                        } else {
                            const predict = getPredictByID([result[0], result[1], result[2]])

                            var matchID = result[0]
                            var date = result[3]
                            var leagueID = result[4]

                            predict.then(function(predictData) {
                                var info = predictData.info[0];
                                var predict = predictData.predict[0][0]

                                const leagueName = getLeagueName(leagueID)

                                leagueName.then(async function(leagueName) {
                                    var predictMessage = `<b>Match: ${info.homeTeam} - ${info.visitorTeam}</b> \n<b>Date & Time:</b> <i>${date}</i> \n<b>League name:</b> ${leagueName[0].name}\n<b>Country:</b> ${leagueName[0].country}\n\n<b>Both teams to score:</b> <code>${predict.btts + '%'}</code>  \n<b>Over 2.5:</b> <code>${predict.over_2_5 + '%'}</code>  \n<b>Under 2.5:</b> <code>${predict.under_2_5 + '%'}</code>  \n<b>Over 3.5:</b> <code>${predict.over_3_5 + '%'}</code>  \n<b>Under 3.5:</b> <code>${predict.under_3_5 + '%'}</code>  \n<b>Half time over 0.5:</b> <code>${predict.HT_over_0_5 + '%'}</code>  \n<b>Half-time under 0.5:</b> <code>${predict.HT_under_0_5 + '%'}</code>  \n<b>Half time over 1.5:</b> <code>${predict.HT_over_1_5 + '%'}</code>  \n<b>Half time under 1.5:</b> <code>${predict.HT_under_1_5 + '%'}</code>  \n<b>AT over 0.5:</b> <code>${predict.AT_over_0_5 + '%'}</code>  \n<b>AT under 0.5:</b> <code>${predict.AT_under_0_5 + '%'}</code>  \n<b>AT over 1.5:</b> <code>${predict.AT_over_1_5 + '%'}</code>  \n<b>AT under 1.5:</b> <code>${predict.AT_under_1_5 + '%'}</code>  \n<b>Home win:</b> <code>${predict.home + '%'}</code>  \n<b>Away win:</b> <code>${predict.away + '%'}</code>  \n<b>Draw:</b> <code>${predict.draw + '%'}</code>  \n`
                                    ctx.replyWithHTML(predictMessage)

                                    /* BETS */

                                    const bestValues = getBestValues(matchID)

                                    await bestValues.then(async function(value) {
                                        var betsValueMessage = `<b>Best bookmakers for this match:</b> \n\n<b>Bookmaker:</b> ${value[0].team1Win[0].bookmakerName} | Team 1 Win: <code>${value[0].team1Win[0].value}</code>\n<b>Bookmaker:</b> ${value[0].teamXWin[0].bookmakerName} | X: <code>${value[0].teamXWin[0].value}</code>\n<b>Bookmaker:</b> ${value[0].team2Win[0].bookmakerName} | Team 2 Win: <code>${value[0].team2Win[0].value}</code>\n`
                                        await ctx.replyWithHTML(betsValueMessage)
                                    })

                                })
                            })
                        }
                    } else {
                        ctx.replyWithHTML(`An unknown error has occurred. Please try again`)
                    }
                })
            } else {
                ctx.reply('VIP predictions are not available to you because you have not purchased a VIP subscription.')
            }

        })

    } catch (error) {
        console.log(error)
    }
})

bot.hears('💰 VIP Subscription', async(ctx) => {
    try {
        let userID = ctx.message.from.id;

        const subStatus = getSubStatus(userID)

        subStatus.then(async function(status) {
            if (status == 1) {

                const conn = await mysql.createConnection(config);
                conn.connect();
                const [rows] = await conn.execute('SELECT `sub_ending_date` FROM `users` WHERE `telegram_id` = "' + userID + '"')
                var subTime = rows[0].sub_ending_date;

                var now = moment();
                var end = moment(Number(subTime));
                var time = end.diff(now);

                var time = new String(moment.utc(time).format('D') + ' Days, ' + moment.utc(time).format('HH') + ' Hours, ' + moment.utc(time).format('mm') + ' Minutes')
                ctx.replyWithHTML(`<b>Status of your VIP subscription:</b> <code>Active</code> \n<b>VIP access time remaining:</b> <code>${time}</code>`, Markup.keyboard(botMenu).resize())
            } else {

                const subPrice = getBotSettings(userID)

                await subPrice.then(async function(result) {
                    await ctx.reply(`You do not have a purchased subscription yet. You can buy it for $${result[0].sub_price} (crypto) or $16 (debit card)`, Markup.keyboard(subBuy).resize())
                })


            }
        })


    } catch (error) {
        console.log(error)
    }
})

bot.hears('💸 Buy a subscription', async(ctx) => {
    try {
        await ctx.reply(`How is it more convenient for you to pay?`, Markup.keyboard(payMethodMenu).resize())
    } catch (error) {
        console.log(error)
    }
})

bot.hears('🪙 Crypto', async(ctx) => {
    try {
        ctx.scene.enter('buySub')
    } catch (error) {
        console.log(error)
    }
})

bot.hears('✅ Support', async(ctx) => {
    try {
        await ctx.reply(`To contact support, follow this link: @globalpredictsupport`, Markup.keyboard(botMenu).resize())
    } catch (error) {
        console.log(error)
    }
})

bot.hears('💳 Debit Card', async(ctx) => {
    try {
        await ctx.scene.enter('buySubCard')
    } catch (error) {
        console.log(error)
    }
})

bot.hears('↩ Back', async(ctx) => {
    try {
        ctx.reply('You turned back.', Markup.keyboard(botMenu).resize())
    } catch (error) {
        console.log(error)
    }
})

/* CRON JOBS */

const job = schedule.scheduleJob('0 0 * * *', async function() {
    const conn = await mysql.createConnection(config);
    conn.connect();
    conn.query('UPDATE `users` SET `showed_predictions` = NULL ;')
    closeConnection(conn)
    console.log('Daily predicts deleted!')
});

bot.launch()