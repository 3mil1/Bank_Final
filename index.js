const express = require('express');
const mongoose = require('mongoose');
const userRoutes = require("./routes/userRoutes");
const sessionRoutes = require("./routes/sessionsRoutes");
const accountRoutes = require("./routes/accountRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');
const swaggerDocument = yaml.load('./docs/api.yaml');
const { RequestHeadersHaveCorrectContentType, RequestBodyIsValidJson, processTransactions } = require('./middlewares/middlewares')


// Start Express
const app = express();

// Dotenv config
require('dotenv').config();

app.use(RequestHeadersHaveCorrectContentType);

app.use(express.json()); // Parse request body if's JSON
app.use(RequestBodyIsValidJson)
app.use(express.urlencoded({extended: true})); // Parse request body if's key=and&value=pairs
app.use("/api/users", userRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Assigning port
const port = 8008 || process.env.PORT;

// Database connection
mongoose.connect(process.env.MONGO_DB,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true
    },
    () => console.log('connected to DB!')
);
processTransactions();
// Express app listening on port
app.listen(port, () => console.log(`Express server is listening on PORT - ${port}`));
