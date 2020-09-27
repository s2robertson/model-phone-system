const express = require('express');
const router = express.Router();

const { checkAuth } = require('../middleware/auth');
router.use(checkAuth);

const BillingPlansController = require('../controllers/billingPlans');

/**
 * Get a list of billing plans
 * @param name (query) - A prefix to search for by name
 * @returns billing plans (_id, name)
 */
router.get('/', async (req, res) => {
    try {
        const billingPlans = await BillingPlansController.findByQuery(req.query);
        
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
        const billingPlan = await BillingPlansController.findById(id);
        
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
        const doc = await BillingPlansController.createBillingPlan(req.body);
        res.status(201).json(doc);
    }
    catch (err) {
        res.status(500).json({
            error : err.message
        });
    }
});

router.patch('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const doc = await BillingPlansController.updateBillingPlan(id, req.body);
        
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