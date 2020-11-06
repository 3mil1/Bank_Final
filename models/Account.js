const mongoose = require("mongoose");
require('dotenv').config();

function generate(n) {
    let add = 1, max = 12 - add;   // 12 is the min safe number Math.random() can generate without it starting to pad the end with zeros.   
    if ( n > max ) {
        return generate(max) + generate(n - max);
    }
    max        = Math.pow(10, n+add);
    let min    = max/10; // Math.pow(10, n) basically
    let number = Math.floor( Math.random() * (max - min + 1) ) + min;
    return ("" + number).substring(add);
}
const accountSchema = mongoose.Schema({
    accountNumber: {
        type: String,
        default: process.env.BANK_PREFIX + generate(16)
    },
    balance: {
        type: Number,
        default: 50,
    },
    currency: {
        type: String,
        minlength: 3,
        maxlength: 3,
        default: "EUR"
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
});

module.exports = mongoose.model("Account", accountSchema);