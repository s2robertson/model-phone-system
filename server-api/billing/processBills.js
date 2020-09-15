const mongoose = require('mongoose');
const Bill = require('../models/bill');
const Call = require('../models/call');
const processCall = require('./processCall');
const PhoneManager = require('../phone/phoneManager');

const { centsFromMoneyString, moneyStringFromCents } = require('../helpers/stringHelper');

const unpaidBillsLimit = 3;

async function processBills() {
    console.log('Running processBills')
    const now = new Date();
    const lastMonth = new Date(now.getTime());
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const bills = await Bill.find({ 
        endDate : { $exists : false }, 
        startDate : { $lt : lastMonth }
    })
    .populate('phoneAccount')
    .populate('billingPlans.billingPlan')
    .exec();
    // calls are not populated yet in case any are ongoing

    const results = await Promise.allSettled(bills.map(bill => processBill(bill, now)));
}

/* IMPORTANT: If the phone account is being closed, the api route handler needs
 * to terminate any ongoing calls (using the phone manager) before calling this */
async function processBill(bill, endDate, phoneAccountDoc = null, closingAccount = false) {
    let _paDoc = phoneAccountDoc || bill.phoneAccount;
    if (_paDoc instanceof mongoose.Types.ObjectId) {
        await bill.populate('phoneAccount').execPopulate();
        _paDoc = bill.phoneAccount;
    }
    console.log(`In processBill for phone account ${_paDoc._id}, ${_paDoc.phoneNumber}`);

    /* Double check that billing plans are populated.  The processBills method populates billing plans
     * en masse for efficiency's sake, but this method can also be called when closing an account */
    if (!bill.populated('billingPlans.billingPlan')) {
        await bill.populate('billingPlans.billingPlan').execPopulate();
    }

    const lastBpEntry = bill.billingPlans[bill.billingPlans.length - 1];
    let nextBill;
    // Start by creating a new bill 
    if (!closingAccount) {
        nextBill = new Bill({
            startDate : endDate,
            phoneAccount : _paDoc._id,
            billingPlans : [{
                startDate : endDate,
                billingPlan : _paDoc.billingPlan
            }]
        });
        console.log(`${_paDoc.phoneNumber}: Creating new bill`);
        await nextBill.save();

        _paDoc.currentBill = nextBill._id;
        
        // Transfer any incomplete calls over to the new bill.
        await Call.updateMany({
            callerBill : bill._id,
            endDate : { $exists : false }
        }, {
            callerBill : nextBill._id
        }).exec();
    }

    // Populate calls now that the update has run
    // N.B. this is sorted automatically by the bill schema
    await bill.populate('calls').execPopulate();
    console.log(`${_paDoc.phoneNumber}: found ${bill.calls.length} calls`);

    bill.endDate = endDate;
    // lastBpEntry.endDate could be set already if the account is suspended
    if (!lastBpEntry.endDate) {
        console.log(`${_paDoc.phoneNumber}: Setting last billing plan entry to ${endDate}`);
        lastBpEntry.endDate = endDate;
    }

    // Calculate the monthly charge
    let totalDue = 0;
    if (bill.billingPlans.length === 1 && !closingAccount) {
        const pricePerMonth = bill.billingPlans[0].billingPlan.pricePerMonth;
        bill.billingPlans[0].amountDue = pricePerMonth;
        totalDue = centsFromMoneyString(pricePerMonth);
        console.log(`${_paDoc.phoneNumber}: Single billing plan with price ${totalDue}`);
    }
    else {
        /* If the customer changed billing plans mid billing period, pro-rate
         * the monthly charges. */
        const billStartTime = bill.startDate.getTime();
        let endOfMonth = endDate;

        /* If the account is being closed (NOT done as part of normal bill generation),
         * pro-rate based on the date the bill would have ended normally */
        if (closingAccount) {
            endOfMonth = new Date(billStartTime);
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        }
        const billDuration = endOfMonth.getTime() - billStartTime;

        console.log(`${_paDoc.phoneNumber}: Multiple (${bill.billingPlans.length}) billing plans`);
        for (const entry of bill.billingPlans) {
            const bpPricePerMonth = centsFromMoneyString(entry.billingPlan.pricePerMonth)
            const bpDuration = entry.endDate.getTime() - entry.startDate.getTime();
            const entryDue = Math.round(bpPricePerMonth * bpDuration / billDuration);
            entry.amountDue = moneyStringFromCents(entryDue);
            totalDue += entryDue;
            console.log(`${_paDoc.phoneNumber}: Billing plan with partial price ${entry.amountDue}`);
        }
    }

    console.log(`${_paDoc.phoneNumber}: About to add calls`);
    let bpIndex = 0;
    for (const call of bill.calls) {
        console.log(`${_paDoc.phoneNumber}: adding call ${call}`);
        while (bill.billingPlans[bpIndex].endDate < call.startDate) {
            console.log(`${_paDoc.phoneNumber}: skipping billing plan entry ${bill.billingPlans[bpIndex]}`);
            bpIndex++;
        }
        console.log(`${_paDoc.phoneNumber}: found appropriate billing plan`);
        if (!call.charges || call.charges.length === 0) {
            /* The billing plan could have been changed since the call was made, so 
             * it's better to process immediately.  This is just here as a fall back. */
            console.log(`${_paDoc.phoneNumber}: processing call`);
            processCall(call, bill.billingPlans[bpIndex].billingPlan);
            await call.save();
        }
        for (const charge of call.charges) {
            console.log(`${_paDoc.phoneNumber}: adding charge ${charge}`);
            totalDue += charge.duration * centsFromMoneyString(charge.rate);
        }
    }

    bill.totalDue = moneyStringFromCents(totalDue);
    console.log(`${_paDoc.phoneNumber}: Total due = ${bill.totalDue}`);
    console.log(`${_paDoc.phoneNumber}: About to save bill`)

    // When closing the account, saving is the caller's responsibility
    if (!closingAccount) {
        await bill.save();
    }

    /* totalDue === 0 is possible when an account has been suspended--no calls can be
     * made, and the billing plan entry has a duration of 0 */
    if (totalDue > 0) {
        let paTotalDue = centsFromMoneyString(_paDoc.totalDue);
        paTotalDue += totalDue;
        _paDoc.totalDue = moneyStringFromCents(paTotalDue);
        if (_paDoc.unpaidBills) {
            _paDoc.unpaidBills.push(bill);
        }
        else {
            _paDoc.unpaidBills = [bill];
        }

        // If more than three unpaid bills remain, suspend the account for non-payment
        if (_paDoc.unpaidBills.length > unpaidBillsLimit) {
            _paDoc.isSuspended = true;
            await PhoneManager.suspendPhone(_paDoc.phoneNumber);
        }

    }

    if (_paDoc.isSuspended && nextBill) {
        nextBill.billingPlans[0].endDate = endDate;
        await nextBill.save();
    }

    // if phone account was provided explicitly, saving is the caller's responsibility
    if (_paDoc.isModified() && !phoneAccountDoc) {
        console.log(`${_paDoc.phoneNumber}: Saving phone account`);
        await bill.phoneAccount.save();
    }
    console.log(`${_paDoc.phoneNumber}: Finished processing bill`);
}

module.exports = {
    unpaidBillsLimit,
    processBills,
    processBill
};