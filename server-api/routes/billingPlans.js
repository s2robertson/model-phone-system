const express = require('express');
const router = express.Router();

const { checkAuth } = require('../middleware/auth');
router.use(checkAuth);

const BillingPlan = require('../models/billingPlan');

const StringHelper = require('../helpers/stringHelper');

/**
 * Get a list of billing plans
 * @param name (query) - A prefix to search for by name
 * @returns billing plans (_id, name)
 */
router.get('/', async (req, res) => {
    const queryDoc = { isActive : true };

    if (req.query.name && typeof req.query.name === 'string') {
        queryDoc.name = { $regex : '^' + StringHelper.escapeRegEx(req.query.name) };
    }
    if (req.query.activeOnly === 'false' || req.query.activeOnly === false) {
        queryDoc.isActive = false;
    }

    try {
        const billingPlans = await BillingPlan.find(queryDoc)
            .select('name')
            .sort({ name : 1 })
            .exec();
        
        res.status(200).json(billingPlans);
    }
    catch(err) {
        res.status(500).json({
            error : err.message
        });
    }
});

/**
 * Get all details for a billing plan
 * @param id - the billing plan's _id
 * @returns All billing plan details
 */
router.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const billingPlan = await BillingPlan.findById(id)
            .select('-__v')
            .exec();
        
        if (billingPlan) {
            res.status(200).json(billingPlan);
        }
        else {
            res.status(404).json({
                error : 'No billing plan found'
            });
        }
    }
    catch(err) {
        res.status(500).json({
            error : err.message
        });
    }
});

/**
 * Create a new billing plan record
 */
router.post('/', async (req, res) => {
    try {
        const billingPlan = new BillingPlan();
        billingPlan.set(req.body);

        const doc = await billingPlan.save();
        res.status(201).json(doc);
    }
    catch (err) {
        res.status(500).json({
            error : err.message
        });
    }
});

router.patch('/:id', async (req, res) => {
    const _id = req.params.id;
    try {
        const doc = await BillingPlan.findByIdAndUpdate(_id, { $set : req.body }, { runValidators : true, returnOriginal : false })
            .select('-__v')
            .exec();
        
        if (doc) {
            res.status(200).json(doc);
        }
        else {
            res.status(404).json({
                error : 'No billing plan found'
            });
        }
    }
    catch (err) {
        res.status(500).json({
            error : err.message
        });
    }
});

module.exports = router;