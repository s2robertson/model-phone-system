const https = require('https');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const session = require('express-session');
const router = require('./server-api/router');

//console.log(process.env.NODE_ENV);

mongoose.Promise = global.Promise;
const mongooseConnectOpts = { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    useFindAndModify : false
};
if (process.env.NODE_ENV === 'production') {
    mongooseConnectOpts.autoIndex = false;
}
mongoose.connect(process.env.DB_CONN, mongooseConnectOpts);

// obviously this needs a more fleshed out solution
if (process.env.ADD_ADMIN === true) {
    console.log('Adding admin');
    const Admin = require('./server-api/models/admin');
    const a = new Admin({
        name : 'admin',
        password : 'defaultpwd'
    });
    a.save();
}

const app = express();
const port = process.env.PORT || 5000;
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('trust proxy', 1);
app.use(session({
    cookie : {
        httpOnly : true,
        sameSite : 'strict',
        secure : true,
        maxAge : 600000 // 10 minutes
    },
    secret : process.env.SESSION_PWD || 'encryptme',
    saveUninitialized : false,
    resave : false
}));
app.set('view engine', 'ejs')
app.set('views', './server-api/views');
app.use("/api", router);

// fallback for route not found
app.use((req, res, next) => {
    const error = new Error('Path not found');
    error.status = 404;
    next(error);
});

// if an error occurred while handling a request
app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.json({ error : err.message });
});

const fs = require('fs');
const options = {
    key : fs.readFileSync('./ssl/key.pem'),
    cert : fs.readFileSync('./ssl/certificate.pem')
};
const server = https.createServer(options, app);
const io = require('socket.io')(server, { serveClient : false });
const phoneManager = require('./server-api/phone/phoneManager');
io.on('connection', phoneManager.onConnect);

const cron = require('node-cron');
const { processBills } = require('./server-api/billing/processBills');
cron.schedule('0 2 * * *', processBills);

server.listen(port, () => console.log('Listening on port ' + port));