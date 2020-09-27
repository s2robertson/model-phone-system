const mongoose = require('mongoose');
const PhoneAccount = require('../models/phoneAccount');
const Bill = require('../models/bill');

const StringHelper = require('../helpers/stringHelper');

const { unpaidBillsLimit } = require('../billing/processBills');
const PhoneManager = require('../phone/phoneManager');
const { processBill } = require('../billing/processBills');

const restrictedPhoneNumbers = [4911, 9911];
const maxPhoneNumber = 9999;

module.exports.generatePhoneNumbers = async function*() {
    const dbVals = await PhoneAccount.find({ isActive : true })
        .select('phoneNumber -_id')
        .sort({ phoneNumber : 1 })
        .exec()

    //console.log(`generating phone number: dbVals=${dbVals}`);

    if (dbVals.length === 0) {
        return '0000';
    }
    
    let currentTry = 0;
    for (let index = 0; index < dbVals.length; index++) {
        let currentBoundary = parseInt(dbVals[index].phoneNumber);
        //console.log(`currentBoundary = ${currentBoundary}`);
        while (currentTry < currentBoundary) {
            //console.log(`trying ${currentTry}`)
            if (restrictedPhoneNumbers.indexOf(currentTry) === -1) {
                yield currentTry.toString().padStart(4, '0');
            }
            currentTry++;
        }
        //console.log(`skipping ${currentTry}`);
        currentTry++;   // skip currentTry === currentBoundary
    }

    while (currentTry <= maxPhoneNumber) {
        //console.log(`trying ${currentTry}`);
        yield currentTry.toString().padStart(4, '0');
        currentTry++;
    }
}

module.exports.createPhoneAccount = async function(customerId, { billingPlan, phoneNumber }, phoneNumberGenerator) {
    if (typeof billingPlan === 'object' && billingPlan._id) {     // if billingPlan.name is denormalized, remove this step
        billingPlan = billingPlan._id;
    }
    const doc = new PhoneAccount();
    doc.customer = customerId;
    doc.billingPlan = billingPlan;
    doc.phoneNumber = phoneNumber;

    let genPhoneNumber = phoneNumber === '####';
    do {
        repeat = false;
        try {
            if (genPhoneNumber) {
                let { value, done } = await phoneNumberGenerator.next();
                if (done) {
                    throw new Error('Phone number generation has been exhausted');
                }
                doc.phoneNumber = value;
            }
            await doc.save();
            genPhoneNumber = false;
        }
        catch (baseError) {
            if (baseError instanceof mongoose.Error.ValidationError) {
                for (const field in baseError.errors) {
                    const error = baseError.errors[field];
                    if (error.kind === 'unique' && error.path === 'phoneNumber') {
                        /* If the requested phone number is already in use, fall back to generating a 
                         * new number. This can also happen if there is a race condition with multiple 
                         * number generation requests at once. */
                        genPhoneNumber = true;
                    }
                    else {
                        throw baseError;
                    }
                }
            }
            else {
                throw baseError;
            }
        }
    } while (repeat);

    return doc;
}

module.exports.updatePhoneAccount = async function({ _id, billingPlan, phoneNumber, makePayment, closeAccount }) {
    let paDoc;
    let oldPhoneNumber;
    const now = new Date();
    try {
        // In order to deal with changes to billingPlan, we need the document before modification
        paDoc = await PhoneAccount.findById(_id)
            .select('-__v')
            .exec();

        if (billingPlan) {
            if (typeof billingPlan === 'object' && billingPlan._id) {
                billingPlan = billingPlan._id;
            }
            
            // If the billing plan is being changed, the current bill needs to be updated
            if (!paDoc.billingPlan.equals(billingPlan) && !paDoc.isSuspended) {
                await paDoc.populate('currentBill').execPopulate();
                const length = paDoc.currentBill.billingPlans.length;
                paDoc.currentBill.billingPlans[length - 1].endDate = now;
                paDoc.currentBill.billingPlans.push({ billingPlan : billingPlan, startDate : now });
            }
            paDoc.billingPlan = billingPlan;
        }

        oldPhoneNumber = paDoc.phoneNumber;
        if (phoneNumber && phoneNumber !== '####') {    // don't do phone number generation on updates
            paDoc.phoneNumber = phoneNumber;
        }

        if (makePayment !== undefined) {
            const payment = StringHelper.centsFromMoneyString(makePayment);
            const oldCents = StringHelper.centsFromMoneyString(paDoc.totalDue);
            const newCents = oldCents - payment;
            paDoc.totalDue = StringHelper.moneyStringFromCents(newCents);

            // loop through the unpaid bills array to see how many fall under the new totalDue
            let index = paDoc.unpaidBills.length - 1;
            let sum = 0;
            await paDoc.populate('unpaidBills').execPopulate();
            while (index > -1 && sum < newCents) {
                const billStr = paDoc.unpaidBills[index].totalDue;
                const billCents = billStr === undefined ? 0 : StringHelper.centsFromMoneyString(billStr);
                sum += billCents;
                index--;
            }

            // if a bill has been paid off, update the array and unsuspend the account if applicable
            if (index > -1) {
                paDoc.unpaidBills = paDoc.unpaidBills.slice(index + 1);
                if (paDoc.isSuspended && paDoc.unpaidBills.length < unpaidBillsLimit) {
                    paDoc.isSuspended = false;
                    if (!paDoc.populated('currentBill')) {
                        await paDoc.populate('currentBill').execPopulate();
                    }
                    paDoc.currentBill.billingPlans.push({ 
                        billingPlan : paDoc.billingPlan,
                        startDate : now 
                    });
                }
            }
        }

        if (closeAccount === true) {
            paDoc.isActive = false;
            PhoneManager.suspendPhone(oldPhoneNumber);
            if (!paDoc.populated('currentBill')) {
                await paDoc.populate('currentBill').execPopulate();
            }
            await processBill(paDoc.currentBill, now, paDoc, true);
        }

        if (paDoc.populated('currentBill')) {
            await paDoc.currentBill.save();
        }
        await paDoc.save();
    }
    catch (baseError) {
        if (baseError instanceof mongoose.Error.ValidationError) {
            for (const field in baseError.errors) {
                const error = baseError.errors[field];
                if (error.kind === 'unique' && error.path === 'phoneNumber' && oldPhoneNumber) {
                    /* If the requested phone number is already in use, fall back to the previously
                     * used number instead of erroring out. */
                    paDoc.phoneNumber = oldPhoneNumber;
                    paDoc.unmarkModified('phoneNumber');
                    await paDoc.save();
                }
                else {
                    throw baseError;
                }
            }
        }
        else {
            throw baseError;
        }
    }

    // post updates to the phone manager if necessary
    if (paDoc.isActive) {
        if (paDoc.isModified('phoneNumber') && paDoc.phoneNumber !== oldPhoneNumber) {
            PhoneManager.updatePhoneNumber(oldPhoneNumber, paDoc.phoneNumber);
        }
        if (paDoc.isModified('isSuspended') && !paDoc.isSuspended) {
            PhoneManager.unsuspendPhone(paDoc.phoneNumber);
        }
    }
    return paDoc;
}

module.exports.getBills = async function(phoneAccountId) {
    const docs = await Bill.find({ 
        phoneAccount : phoneAccountId, 
        endDate : { $exists : true }
    })
    .select('endDate totalDue')
    .sort({ endDate : -1 })
    .exec();

    return docs;
}