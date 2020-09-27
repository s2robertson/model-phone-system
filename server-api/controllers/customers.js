const Customer = require('../models/customer');
const PhoneAccount = require('../models/phoneAccount');
const PhoneAccountController = require('./phoneAccounts');

const StringHelper = require('../helpers/stringHelper');

module.exports.findByQuery = async function(query) {
    const queryDoc = {};

    if (query.lastName && typeof query.lastName === "string") {
        queryDoc.lastName = { $regex : '^' + StringHelper.escapeRegEx(query.lastName) };
    }

    const customers = await Customer.find(queryDoc)
        .select("firstName lastName")
        .sort({ lastName : 1 })
        .exec();
    return customers;
}

module.exports.findById = async function(id) {
    const customer = await Customer.findById(id)
        .select("-__v")
        .populate({
            path : 'phoneAccounts',
            match : { isActive : true },
            select : '-__v -isActive',
            populate : {
                path : 'billingPlan',
                select : 'name'             // possible candidate for denormalizing
            }
        })
        .exec();
    return customer;
}

module.exports.createCustomer = async function(customerReq, phoneAccountsReq) {
    const customerDoc = new Customer();
    customerDoc.set(customerReq);
    await customerDoc.save();
    
    // this should probably be done as a transaction
    if (phoneAccountsReq) {
        const phoneNumberGenerator = PhoneAccountController.generatePhoneNumbers();
        const paDocs = [];
        for (const phoneAccount of phoneAccountsReq) {
            const paDoc = await PhoneAccountController.createPhoneAccount(customerDoc._id, phoneAccount, phoneNumberGenerator);
            paDocs.push(paDoc);
        }

        await PhoneAccount.populate(paDocs, {
            path : 'billingPlan',
            select : 'name'
        });
        customerDoc.phoneAccounts = paDocs;
    }

    return customerDoc;
}

module.exports.updateCustomer = async function(id, customerReq, phoneAccountsReq) {
    let customerDoc;

    if (Object.keys(customerReq).length > 0) {
        customerDoc = await Customer.findByIdAndUpdate(id, { $set : customerReq }, { runValidators : true, returnOriginal : false })
            .select('-__v')
            .exec();
        //console.log(customerRes);
        
        if (!customerDoc) {
            return null;
        }
    }
    else if (phoneAccountsReq) {
        //console.log('No customer updates given.  Checking id');
        customerDoc = await Customer.findById(id)
            .select('-__v')
            .exec();
        //console.log(customer);

        if (!customerDoc) {
            return null;
        }
    }
    else {
        throw new Error('No details provided for update');
    }

    if (phoneAccountsReq) {
        //console.log('Updating phone accounts');
        const paDocs = [];
        const phoneNumberGenerator = PhoneAccountController.generatePhoneNumbers();
        for (const phoneAccount of phoneAccountsReq) {
            if (phoneAccount._id === 'new') {
                const paDoc = await PhoneAccountController.createPhoneAccount(id, phoneAccount, phoneNumberGenerator);
                paDocs.push(paDoc);
            }
            else {
                const paDoc = await PhoneAccountController.updatePhoneAccount(phoneAccount);
                if (paDoc && paDoc.isActive) {
                    paDocs.push(paDoc);
                }
            }
        }

        await PhoneAccount.populate(paDocs, {
            path : 'billingPlan',
            select : 'name'
        });
        customerDoc.phoneAccounts = paDocs;
    }

    return customerDoc;
}