const { Markup, Composer, Scenes } = require('telegraf')

const mysql = require('mysql2/promise');
var db_config = require('../dbConfig')
var moment = require('moment');
var axios = require('axios');
var crypto = require("crypto");

/* VELLA PAYMENT */

const vella_url = 'https://api.paystack.co';
const pay_secret = ''
const pay_public = ''

var botMenu = [
    ['⏱ Trial status', '⚽️ Trial Daily Tips'],
    ['🏆 VIP Tips', '💰 VIP Subscription'],
    ['🤝 Referral system'],
]

var payCheck = [
    ['✅ I sent the payment'],
    ['Cancel'],
]

var valute = [
    ['Cancel']
]

function closeConnection(conn) {
    conn.end(function(err) {
        if (err) {
            return console.log('error:' + err.message);
        }
        console.log('Close the database connection.');
    });
}

var userData;

const startStep = new Composer()
startStep.on('text', async(ctx) => {
    ctx.wizard.state.data = {}
    await ctx.replyWithHTML(`Please enter your email address:`, Markup.keyboard(valute).resize())
    return ctx.wizard.next()
})

const paymentCreate = new Composer()
paymentCreate.on('text', async(ctx) => {


    var messageText = ctx.update.message.text;

    const conn = await mysql.createConnection(db_config);
    conn.connect();
    const [price] = await conn.execute('SELECT `sub_price` FROM `bot_settings` WHERE `id` = "' + 1 + '"')
    var subPrice = price[0].sub_price
    let payment_title = crypto.randomBytes(6).toString('hex').toUpperCase();
    userData = {
        valute: '',
        email: messageText,
        price: 16,
        title: payment_title,
        name: '',
        reference: ''
    }

    userData.name = ctx.message.from.first_name;

    if (messageText == 'Cancel') {

        ctx.reply('Purchase cancelled', Markup.keyboard(botMenu).resize())
        return ctx.scene.leave()
    } else {
        userData.valute = messageText

        ctx.reply(`Creating a payment...`, Markup.removeKeyboard())
        const options = {
            method: 'POST',
            url: `${vella_url}/transaction/initialize`,
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${pay_secret}`,
                'content-type': 'application/json'
            },
            data: {
                email: userData.email,
                amount: userData.price
            }
        };

        axios
            .request(options)
            .then(function(response) {
                userData.reference = response.data.data.reference
                ctx.replyWithHTML(`Your payment link: ${response.data.data.authorization_url}\n\nWhen you have made the payment, click the <b>"I sent the payment"</b> button below.`, Markup.keyboard(payCheck).resize())
                return ctx.wizard.next()
            })
            .catch(function(error) {
                console.error(error);
                ctx.reply('An error occurred.', Markup.keyboard(botMenu).resize())
                return ctx.scene.leave()
            });
    }
})

const paymentCheck = new Composer()
paymentCheck.on('text', async(ctx) => {

    const conn = await mysql.createConnection(db_config);
    conn.connect();
    let userID = ctx.message.from.id;
    var messageText = ctx.update.message.text;

    if (messageText == '✅ I sent the payment') {
        const options = {
            method: 'GET',
            url: `${vella_url}/transaction/verify/${userData.reference}`,
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${pay_secret}`,
                'content-type': 'application/json'
            },
            data: ''
        };

        axios
            .request(options)
            .then(function(response) {
                if (response.data.data.status == 'success') {

                    /* ADD SUB */

                    var now = moment()
                    var subEndingDate = now.add(30, 'days');
                    conn.query('UPDATE `users` SET `sub_ending_date` = "' + subEndingDate + '" WHERE `telegram_id` = "' + userID + '" ;')
                    conn.query('UPDATE `users` SET `sub_status` = "1" WHERE `telegram_id` = "' + userID + '" ;')

                    /* ADD SUB END */

                    ctx.reply(`Congratulations ${userData.name}! You have successfully subscribed to VIP ACCESS, which gives you unlimited bets and predictions for 30 days.`, Markup.keyboard(botMenu).resize())

                    return ctx.scene.leave()
                } else {
                    ctx.reply(`Your payment has not been found yet. Please try again in a few minutes.`, Markup.keyboard(payCheck).resize())
                }
            })
            .catch(function(error) {
                console.error(error);
                ctx.reply('An error occurred.', Markup.keyboard(botMenu).resize())
                return ctx.scene.leave()
            });
    } else {
        ctx.reply('Purchase cancelled', Markup.keyboard(botMenu).resize())
        return ctx.scene.leave()
    }

})


const buySubCard = new Scenes.WizardScene('buySubCard', startStep, paymentCreate, paymentCheck)
module.exports = buySubCard;