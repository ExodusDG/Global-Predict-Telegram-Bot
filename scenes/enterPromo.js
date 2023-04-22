const { Markup, Composer, Scenes } = require('telegraf')

const mysql = require('mysql2/promise');
var config = require('../dbConfig')
var moment = require('moment');

var botMenu = [
    ['⏱ Trial status', '⚽️ Trial Daily Tips'],
    ['💰 VIP Subscription'],
    ['🤝 Referral system'],
]

function closeConnection(conn) {
    conn.end(function (err) {
        if (err) {
            return console.log('error:' + err.message);
        }
        console.log('Close the database connection.');
    });
}

const startStep = new Composer()
startStep.on('text', async (ctx) => {
    ctx.wizard.state.data = {}
    await ctx.reply(`Enter your friend's promo code below:`, Markup.removeKeyboard())
    return ctx.wizard.next()
})

const enterPromoStep = new Composer();
enterPromoStep.on('text', async (ctx) => {
    messageText = ctx.update.message.text;
    let userID = ctx.message.from.id;

    const conn = await mysql.createConnection(config);
    conn.connect();
    const [rows] = await conn.execute('SELECT `promocode` FROM `promocodes`')
    const [userPromo] = await conn.execute('SELECT `promocode` FROM `promocodes` WHERE `telegram_id` = "' + userID + '"')
    const [userData] = await conn.execute('SELECT `trial_ending_date` FROM `users` WHERE `telegram_id` = "' + userID + '"')
    const [botSettings] = await conn.execute('SELECT `referral_time` FROM `bot_settings`')

    var botATT = [botSettings[0].referral_time]
    var promocodes = [rows];
    var trialEndingDate = [userData[0].trial_ending_date]
    var userPromocode = [userPromo[0].promocode]
    messageText = messageText.toUpperCase()

    //trialEndingDate

    var now = moment();
    var end = moment(Number(trialEndingDate));
    var time = end.diff(now);
    var minutes = end.diff(now, 'minutes');

    if (userPromocode[0] != messageText) {
        if (promocodes[0].find(el => el.promocode == messageText) != undefined) {
            var newDate;

            if (minutes > 0) {
                console.log('MIN > 0')
                newDate = moment(Number(trialEndingDate)).add(botATT[0], 'd');
                console.log(botATT[0])
            } else {
                console.log('MIN < 0')
                newDate = now.add((botATT[0] * 24) - 23.9, 'h');
                console.log(botATT[0])
            }

            /* PROMO STATS */

            const [promoUses] = await conn.execute('SELECT * FROM `promocodes` WHERE `promocode` = "' + messageText + '"')
            var currentPromo = [promoUses[0]][0];

            var usesNumber;

            if (currentPromo.uses == null) {
                usesNumber = 1;
            } else {
                usesNumber = Number(currentPromo.uses) + 1
            }

            conn.query('UPDATE `promocodes` SET `uses` = "' + usesNumber + '" WHERE `promocodes`.`promocode` = "' + messageText + '";')

            conn.query('UPDATE `users` SET `trial_ending_date` = "' + newDate + '" WHERE `users`.`telegram_id` = "' + userID + '";')
            conn.query('UPDATE `users` SET `is_promo_used` = "true" WHERE `users`.`telegram_id` = "' + userID + '";')

            await ctx.reply(`You are charged an additional ${botATT} day of the trial period!`, Markup.keyboard(botMenu).resize())
            return ctx.scene.leave()
        } else {

            await ctx.reply(`Such promo code was not found!`, Markup.keyboard(botMenu).resize())
            return ctx.scene.leave()
        }
    } else {
        await ctx.reply(`You have entered your own promo code, this is an error. Please enter a friend's promo code to get extra time for the trial.`, Markup.keyboard(botMenu).resize())
        return ctx.scene.leave()
    }
})

const enterPromo = new Scenes.WizardScene('enterPromo', startStep, enterPromoStep)
module.exports = enterPromo;