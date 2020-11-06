const express = require('express');
const router = express.Router();
const Users = require('../models/User');
const bcrypt = require('bcrypt');
const Sessions = require('../models/Sessions');
const { verifyToken } = require('../middlewares/middlewares');

// Create a session
router.post(
    '/',
    async (req, res) => {

        // Validate a user with given username and password exists in the database
        try {
            const {username, password} = req.body;
            // Checks if the username and/or password exists in the database before logging in
            const user = await Users.findOne({username});
            if (!username || !password) return res.status(400).json({error: "Username and password required"});

            if(!user) return res.status(400).json({error: "Invalid username or password"});
            const validPass = await bcrypt.compare(password, user.password);
            if (!validPass) return res.status(400).json({error: "Invalid username or password"});
            // Creates a new Session in the database with an users userId
            const newSession = await Sessions.create({userId: user._id});

            // Returns a successful status and the token created
            return res.status(200).json({token: newSession._id});

        } catch (err) {

            res.status(500).json({error: "Oops! Something went wrong"} );
            console.log(err.message);
        }
    })

// Delete a session
router.delete('/', verifyToken, async (req, res) => {
    try {

        // Get a specific users session token
        const sessionId = req.headers.authorization.split(' ')[1]

        // Removes a session by the header with the provided sessionId
        const removedSessions = await Sessions.deleteOne({ _id: sessionId });
        if (!removedSessions) return res.status(404).json({error: "Session not found"});
        res.status(200).json({ message: "Token successfully deleted" });
    } catch (err) {
        // If mongodb has an issue
        res.status(500).json({ error: "Oops! Something went wrong" });
        console.log(err.message);
    }
});

module.exports = router;
