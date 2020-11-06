const mongoose = require("mongoose");
module.exports = mongoose.model('CentralBank', new mongoose.Schema({
    name: {  type: String,  required: true  },
    apiKey: {  type: String,  required: true  },
    transactionUrl: {  type: String,  required: true  },
    bankPrefix: {  type: String,  required: true,  minlength: 3,  maxlength: 3  },
    owners: {  type: String,  required: true,  minlength: 1  },
    jwksUrl: { type: String, required: true }
}));