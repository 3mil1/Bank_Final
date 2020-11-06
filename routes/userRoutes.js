const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Account = require("../models/Account");
const bcrypt = require('bcrypt');

// Saves a user with an username and password
router.post('/register', async (req, res) => {

    try {
        // check if email exists
        const userNameExists = await User.findOne({username: req.body.username});
        if(userNameExists) return res.status(409).json({error: "Username already exists"});

        //Request body
        const { name, username, password } = req.body;
        if(!name || !username || !password) return res.status(400).json({error: "All fields must be filled"})
        if(password.length < 8) {return res.status(400).json({error: "Password length must be 8 or more characters"})}

        // BCrypt Salt
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);


        const newUser = new User({name, username,password: hashedPassword });
        const newAccount = new Account({ user: newUser._id});

        const savedUser = await newUser.save();
        const savedAccount = await newAccount.save();
        res.status(201).json({
            message: "User saved"
        });
    } catch (err) {
        res.status(500).json({error: "Oops! Something went wrong"} );
        console.log(err.message);
    }
});


module.exports = router;