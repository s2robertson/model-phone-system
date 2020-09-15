const express = require('express');
const router = express.Router();

const { checkAuth } = require('../middleware/auth');
router.use(checkAuth);

const Bill = require('../models/bill');

const ErrorHelper = require('../helpers/errorHelper');

router.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const doc = await Bill.findById(id)
        .populate({
            path : 'billingPlans.billingPlan',
            select : 'name'
        })
        /*.populate({
            path : 'phoneAccount',
            populate : 'customer'
        })*/
        .populate('calls')
        .exec();

        if (!doc) {
            return res.status(404);
        }
        /*res.render('bill', {
            bill : doc,
            customer : doc.phoneAccount.customer,
            phoneAccount : doc.phoneAccount
        });*/
        res.status(200).json(doc);
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({
            error : message
        });
    }
});

module.exports = router;