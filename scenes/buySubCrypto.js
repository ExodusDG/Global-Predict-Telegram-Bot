const { Markup, Composer, Scenes } = require('telegraf')

const mysql = require('mysql2/promise');
var db_config = require('../dbConfig')
var moment = require('moment');

var axios = require('axios');
var qs = require('qs');

const LAZER_PUBLIC_KEY = '';
const LAZER_SECRET_KEY = '';

var botMenu = [
    ['⏱ Trial status', '⚽️ Trial Daily Tips'],
    ['🏆 VIP Tips', '💰 VIP Subscription'],
    ['🤝 Referral system'],
]

var payCheck = [
    ['✅ I sent the payment'],
    ['Cancel'],
]

var cryptoWallets = [
    ['BUSD', 'DAI'],
    ['USDT', 'USDC'],
    ['Cancel'],
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

    const conn = await mysql.createConnection(db_config);
    conn.connect();
    const [price] = await conn.execute('SELECT `sub_price` FROM `bot_settings` WHERE `id` = "' + 1 + '"')
    var subPrice = price[0].sub_price

    ctx.replyWithHTML(`Which crypto wallet do you want to use?`, Markup.keyboard(cryptoWallets).resize())
    userData = {
        coin: '',
        email: '',
        name: '',
        vallet: '',
        price: subPrice
    }
    return ctx.wizard.next()
})

const cryptoWalletStep = new Composer();
cryptoWalletStep.on('text', async(ctx) => {
    messageText = ctx.update.message.text;
    userData.coin = messageText;

    if (messageText == 'Cancel') {
        ctx.reply('Purchase cancelled.', Markup.keyboard(botMenu).resize())
        return ctx.scene.leave()
    } else {
        ctx.reply('Please enter your email address', Markup.removeKeyboard())
        return ctx.wizard.next()
    }


})

const cryptoEmailStep = new Composer();
cryptoEmailStep.on('text', async(ctx) => {
    messageText = ctx.update.message.text;
    userData.name = ctx.message.from.first_name;
    userData.email = messageText;


    ctx.reply('Loading...')

    var data = qs.stringify({
        'customer_name': userData.name,
        'customer_email': userData.email,
        'coin': userData.coin,
        'currency': 'USD',
        'amount': userData.price, //price
        'reference': ''
    });
    var config = {
        method: 'post',
        url: 'https://api.lazerpay.engineering/api/v1/transaction/initialize',
        headers: {
            'X-api-key': LAZER_PUBLIC_KEY,
            'Authorization': `Bearer ${LAZER_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };

    axios(config)
        .then(function(response) {
            userData.vallet = response.data.data.address;
            ctx.replyWithHTML(`To complete payment send $${userData.price} to <code>${response.data.data.address}</code> <b>(${userData.coin})</b>`, Markup.keyboard(payCheck).resize())
            return ctx.wizard.next()
        })
        .catch(function(error) {
            console.log(error);
            ctx.reply('An error occurred.', Markup.keyboard(botMenu).resize())
            return ctx.scene.leave()
        });
})

const checkPaymentStep = new Composer();
checkPaymentStep.on('text', async(ctx) => {
    messageText = ctx.update.message.text;
    let userID = ctx.message.from.id;

    if (messageText === '✅ I sent the payment') {

        ctx.reply('We are verifying the payment...')

        var config = {
            method: 'get',
            url: `https://api.lazerpay.engineering/api/v1/transaction/verify/${userData.vallet}`,
            headers: {
                'X-api-key': LAZER_PUBLIC_KEY,
                'Authorization': `Bearer ${LAZER_SECRET_KEY}`,
            },
            data: ''
        };

        axios(config)
            .then(async function(response) {

                if (response.data.data.status === 'confirmed') {

                    /* ADD SUB */

                    var now = moment()
                    var subEndingDate = now.add(30, 'days');
                    const conn = await mysql.createConnection(db_config);
                    conn.connect();
                    conn.query('UPDATE `users` SET `sub_ending_date` = "' + subEndingDate + '" WHERE `telegram_id` = "' + userID + '" ;')
                    conn.query('UPDATE `users` SET `sub_status` = "1" WHERE `telegram_id` = "' + userID + '" ;')

                    /* ADD SUB END */

                    ctx.reply(`Congratulations ${userData.name}! You have successfully subscribed to VIP ACCESS, which gives you unlimited bets and predictions for 30 days.`, Markup.keyboard(botMenu).resize())
                    return ctx.scene.leave()
                } else if (response.data.data.status === 'pending') {
                    ctx.reply(`Your payment has not been found yet. Please try again in a few minutes.`, Markup.keyboard(payCheck).resize())
                } else {
                    ctx.reply('An error occurred.', Markup.keyboard(botMenu).resize())
                    return ctx.scene.leave()
                }
            })
            .catch(function(error) {
                console.log(error);
                ctx.reply('An error occurred.', Markup.keyboard(botMenu).resize())
                return ctx.scene.leave()
            });


    } else {
        ctx.reply('Purchase cancelled', Markup.keyboard(botMenu).resize())
        return ctx.scene.leave()
    }
})


const buySub = new Scenes.WizardScene('buySub', startStep, cryptoWalletStep, cryptoEmailStep, checkPaymentStep)
module.exports = buySub;