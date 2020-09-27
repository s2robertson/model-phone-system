const express = require('express');
const router = express.Router();

const { checkAuth } = require('../middleware/auth');
router.use(checkAuth);

const CustomerController = require('../controllers/customers');

const ErrorHelper = require('../helpers/errorHelper');

/**
 * Get a list of customers
 * @param lastName (query) - A prefix to search for by last name
 * @returns customers (_id, firstName, lastName) 
 */
router.get("/", async (req, res) => {
    try {
        const customers = await CustomerController.findByQuery(req.query);

        res.status(200).json(customers);
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({ error : message });
    }
});

/**
 * Get all details for a customer
 * @param id - the customer's _id
 * @returns All customer details
 */
router.get("/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const customer = await CustomerController.findById(id);
    
        if (customer) {
            res.status(200).json(customer);
        }
        else {
            res.status(404).json({ error : `No customer found with id=${id}` });
        }
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({ error : message });
    }
});

/**
 * Create a new customer record
 */
router.post("/", async (req, res) => {
    try {
        const { phoneAccounts, ...customerReqBody } = req.body;
        const customerDoc = await CustomerController.createCustomer(customerReqBody, phoneAccounts);
        
        res.status(201).json(customerDoc);
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({
            error : message
        });
    }
});

/**
 * Update a customer record
 * @param id - the customer's _id
 */
router.patch("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const { _id, phoneAccounts, ...customerReqBody } = req.body;

        const customerDoc = await CustomerController.updateCustomer(id, customerReqBody, phoneAccounts);
        if (customerDoc) {
            res.status(200).json(customerDoc);
        }
        else {
            res.status(404).json({
                error : 'No customer found'
            });
        }
    }
    catch (err) {
        const message = ErrorHelper.getErrorMessage(err);
        res.status(500).json({
            error : message
        });
    }
});

module.exports = router;