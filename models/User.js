const mongoose = require('mongoose');

module.exports = mongoose.model('Users', new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: [true,'Username already exists']
    },
    password: {
        type: String,
        required: true,

    },
    createdAt: {
        type: Date,
        default: Date.now()
    }
}));