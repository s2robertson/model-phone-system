const express = require('express');
const router = express.Router();

const { checkAuth } = require('../middleware/auth');
router.use(checkAuth);

const PhoneAccount = require('../models/phoneAccount');
const Bill = require('../models/bill');

const ErrorHelper = require('../helpers/errorHelper');

router.get('/:id/bills', async (req, res) => {
    const id = req.params.id;
    try {
        const docs = await Bill.find({ 
            phoneAccount : id, 
            endDate : { $exists : true }
        })
        .select('endDate totalDue')
        .sort({ endDate : -1 })
        .exec();

        res.status(200).json(docs);
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({ error : message });
    }
});

module.exports = router;