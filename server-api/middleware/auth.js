const Admin = require('../models/admin');
const errorHelper = require('../helpers/errorHelper');

module.exports.checkAuth = (req, res, next) => {
    if (req.session.adminName) {
        // Success
        next();
    }
    else {
        res.status(401).json({
            error : 'Log in to access the system.'
        });
    }
}

module.exports.logInGet = (req, res) => {
    if (req.session.adminName) {
        res.status(200).json({
            name : req.session.adminName
        });
    }
    else {
        res.status(404).json({
            error : 'No login details found.'
        });
    }
}

module.exports.logInPost = async (req, res) => {
    try {
        let success = false;
        const admin = await Admin.findOne({
            name : req.body.name
        }).exec();

        if (admin) {
            success = await admin.comparePassword(req.body.password);
        }
        
        if (success) {
            req.session.adminName = req.body.name;
            res.status(200).json({
                name : req.body.name
            });
        }
        else {
            res.status(401).json({
                error : 'Invalid username/password'
            });
        }
    }
    catch (err) {
        const message = errorHelper.getErrorMessage(err);
        res.status(500).json({
            error : message
        });
    }
}

module.exports.logOut = async (req, res) => {
    try {
        await req.session.destroy();
        res.status(200).json({
            message : 'Logged out'
        });
    }
    catch (err) {
        const message = errorHelper.getErrorMessage(err);
        res.status(500).json({
            error : message
        });
    }
}