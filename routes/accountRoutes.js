const express = require('express');
const router = express.Router();
const Users = require('../models/User');
const bcrypt = require('bcrypt');
const Sessions = require('../models/Sessions');
const Accounts = require("../models/Account")
const { verifyToken } = require('../middlewares/middlewares');

// Get account details
router.get('/', verifyToken, async (req, res) => {
    try {

        const user = await Users.findOne({_id: req.userId}).select({ "name": 1, "username": 1, "password": 1, "_id": 0 });
        if (!user) {
            res.status(404).json({error: "User not found"})
        }

        const userAccount = await Accounts.findOne({user: req.userId}).select({ "accountNumber": 1, "balance": 1, "currency": 1, "user": 1, "_id": 0 });

        if (!userAccount) {
            res.status(404).json({error: "Account not found"})
        }
        res.status(200).json({
            name: user.name,
            username: user.username,
            account: [{
                account_number: userAccount.accountNumber,
                balance: userAccount.balance,
                currency: userAccount.currency
            }]
        });

    } catch (err) {
        res.status(500).json({ error: "Oops! Something went wrong" });
        console.log(err.message);
    }
});
module.exports = router;
