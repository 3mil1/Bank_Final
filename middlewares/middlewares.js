const mongoose = require('mongoose');
const sessionModel = require('../models/Sessions');
const accountModel = require('../models/Account');
const transactionModel = require('../models/Transactions');
const bankModel = require('../models/CentralBank');
const fetch = require('node-fetch');
const fs = require('fs');
const jose = require('node-jose');
const abortController = require('abort-controller');

require('dotenv').config();

exports.RequestBodyIsValidJson = (err, req, res, next) => {
    // body-parser will set this to 400 if the json is in error
    if (err.status === 400)
        return res.status(err.status).send('Malformed JSON');
    return next(err); // if it's not a 400, let the default error handling do it.
}

exports.RequestHeadersHaveCorrectContentType = (req, res, next) => {
    // Catch invalid Content-Types
    var RE_CONTYPE = /^application\/(?:x-www-form-urlencoded|json)(?:[\s;]|$)/i;
    if (req.method !== 'GET' && !RE_CONTYPE.test(req.headers['content-type'])) {
        res.setStatus = 406
        return res.send('Content-Type is not application/json');
    }
    next();
}

exports.verifyToken = async(req, res, next) => {

    // Check Authorization header is provided
    let authorizationHeader = req.header('Authorization')
    if (!authorizationHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' })
    }

    // Split Authorization header into an array (by spaces)
    authorizationHeader = authorizationHeader.split(' ')

    // Check Authorization header from token
    if (!authorizationHeader[1]) {
        return res.status(400).json({ error: 'Invalid Authorization header format' })
    }

    // Validate token is in mongo ObjectId format to prevent UnhandledPromiseRejectionWarnings
    if (!mongoose.Types.ObjectId.isValid(authorizationHeader[1])) {
        return res.status(401).json({ error: 'Invalid token' })
    }

    const session = await sessionModel.findOne({ _id: authorizationHeader[1] });
    if (!session) return res.status(401).json({ error: 'Invalid token' });

    // Write user's id into req
    req.userId = session.userId

    return next(); // Pass the request to the next middleware
}
exports.processTransactions = async() => {
    let serverResponseAsJson, serverResponseAsPlainText, serverResponseAsObject, timeout, bankTo, transactionExpiryTime

    // Init jose keystore
    const privateKey = fs.readFileSync('./keys/private.key').toString()
    const keystore = jose.JWK.createKeyStore();
    const key = await keystore.add(privateKey, 'pem')

    // Get pending transactions
    const pendingTransactions = await transactionModel.find({ status: 'pending' })

    // Loop through each transaction and send a request
    pendingTransactions.forEach(async transaction => {

        console.log('loop: Processing transaction...');
        console.log(transaction)
        // Calculate transaction expiry time
        transactionExpiryTime = new Date(
            transaction.createdAt.getFullYear(),
            transaction.createdAt.getMonth(),
            transaction.createdAt.getDate() +
            3);

        if (transactionExpiryTime < new Date) {

            // Set transaction status to failed
            transaction.status = 'failed'
            transaction.statusDetail = 'Timeout reached'
            transaction.save();

            // Go to next transaction
            return
        }

        // Create abortController to be able to abort the request if it's long-running
        const abortCtrl = new abortController()

        // Set transaction status to in progress
        transaction.status = 'inProgress'
        transaction.save();

        let bankPrefix = transaction.accountTo.slice(0, 3);
        bankTo = await bankModel.findOne({ bankPrefix })

        let centralBankResult
        if (!bankTo) {
            centralBankResult = exports.refreshBanksFromCentralBank()
        }

        if (typeof centralBankResult !== 'undefined' && centralBankResult.error !== 'undefined') {

            console.log('loop: There was an error when trying to reach central bank')
            console.log(centralBankResult.error)

            // Set transaction status back to pending
            transaction.status = 'pending'
            transaction.statusDetail = 'Central bank was down - cannot get destination bank details. More details: ' + centralBankResult.error
            transaction.save();

            // Go to next transaction
            return
        } else {

            // Attempt to get the destination bank after refresh again
            bankTo = await bankModel.findOne({ bankPrefix })
        }

        if (!bankTo) {
            console.log('loop: WARN: Failed to get bankTo')
            // Set transaction status failed
            transaction.status = 'failed'
            transaction.statusDetail = 'There is no bank with prefix ' + bankPrefix
            transaction.save();

            // Go to next transaction
            return
        }

        // Create JWT
        const jwt = await jose.JWS.createSign({
            alg: 'RS256',
            format: 'compact'
        }, key).update(JSON.stringify({
            accountFrom: transaction.accountFrom,
            accountTo: transaction.accountTo,
            currency: transaction.currency,
            amount: transaction.amount,
            explanation: transaction.explanation,
            senderName: transaction.senderName
        }), 'utf8').final()

        // Send request to remote bank
        try {

            console.log('loop: Making request to ' + bankTo.transactionUrl);

            // Abort connection after 1 second
            timeout = setTimeout(() => {

                console.log('loop: Aborting long-running transaction');

                // Abort the request
                abortCtrl.abort()

                // Set transaction status back to pending
                transaction.status = 'pending'
                transaction.statusDetail = 'Server is not responding'
                transaction.save();
            }, 1000)

            // Actually send the request
            serverResponseAsObject = await fetch(bankTo.transactionUrl, {
                signal: abortCtrl.signal,
                method: 'POST',
                body: JSON.stringify({ jwt }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            // Get server response as plain text
            serverResponseAsPlainText = await serverResponseAsObject.text()

        } catch (e) {
            console.log('loop: Making request to another bank failed with the following message: ' + e.message)
        }

        // Cancel aborting
        clearTimeout(timeout)

        // Server did not respond (we aborted before that)
        if (typeof serverResponseAsPlainText === 'undefined') {

            // Stop processing this transaction for now and take the next one
            return
        }

        // Attempt to parse server response from text to JSON
        try {
            serverResponseAsJson = JSON.parse(serverResponseAsPlainText)
        } catch (e) {

            // Log the error
            console.log('loop: ' + e.message + '. Response was: ' + serverResponseAsPlainText)
            transaction.status = 'failed'
            transaction.statusDetail = 'The other bank said ' + serverResponseAsPlainText
            transaction.save()

            // Go to next transaction
            return
        }

        // Log bad responses from server to transaction statusDetail
        if (serverResponseAsObject.status < 200 || serverResponseAsObject.status >= 300) {
            console.log('loop: Server response was ' + serverResponseAsObject.status);
            transaction.status = 'failed'
            transaction.statusDetail = typeof serverResponseAsJson.error !== 'undefined' ?
                serverResponseAsJson.error : serverResponseAsPlainText
            transaction.save()
            return
        }

        // Add receiverName to transaction
        transaction.receiverName = serverResponseAsJson.receiverName

        // Deduct accountFrom
        const accountFromBalance = await accountModel.findOne({ accountNumber: transaction.accountFrom })
        accountFromBalance.balance = accountFromBalance.balance - transaction.amount
        accountFromBalance.save();

        // Update transaction status to completed
        console.log('loop: Transaction ' + transaction.id + ' completed')
        transaction.status = 'completed'
        transaction.statusDetail = ''

        // Write changes to DB
        console.log("Saved transaction to database")
        transaction.save()
    }, Error())

    // Call same function again after 1 sec
    setTimeout(exports.processTransactions, 1000)
}

exports.refreshBanksFromCentralBank = async() => {

    try {
        console.log('Refreshing banks');

        console.log('Attempting to contact central bank at ' + `${process.env.CENTRAL_BANK_URL}/banks`)
        banks = await fetch(`${process.env.CENTRAL_BANK_URL}/banks`, {
            headers: { 'Api-Key': process.env.CENTRAL_BANK_API_KEY }
        })
            .then(responseText => responseText.json())
        console.log(banks);
        // Delete all old banks
        await bankModel.deleteMany()

        // Create new bulk object
        const bulk = bankModel.collection.initializeUnorderedBulkOp();

        // Add banks to queue to be inserted into DB
        banks.forEach(bank => {
            bulk.insert(bank);
        })

        // Start bulk insert
        await bulk.execute();
    } catch (e) {
        return { error: e.message }
    }

    return true
}
