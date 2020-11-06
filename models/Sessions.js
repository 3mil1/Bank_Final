const mongoose = require('mongoose');

module.exports = mongoose.model('Sessions', new mongoose.Schema({
    userId: String,
    token: String
}));