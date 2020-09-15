const mongoose = require('mongoose');
const beautify = require('mongoose-beautiful-unique-validation');

const Bill = require('./bill');
const { moneyRegEx } = require('../helpers/stringHelper');

/* I'm undecided on whether or not phone accounts should be in their own collection,
 * vs. embedding them in the customer document.  Additionally, I wonder whether
 * current bill should be embedded in the phone account, then extracted to its own
 * collection when finalized (which would remove the need for the post save hook below). */

const phoneAccountSchema = mongoose.Schema({
    customer : { 
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Customer',
        required : true
    },
    billingPlan : {
        type : mongoose.Schema.Types.ObjectId,      // This could be verified with mongoose-id-validator
        ref : 'BillingPlan',
        required : true
    },
    phoneNumber : {
        type : String,
        required : function() { return this.active },
        match : [/\d{4}/, 'Phone numbers must be four digits']
    },
    currentBill : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Bill'
    },
    isActive : {
        type : Boolean,
        required : true,
        default : true
    },
    isSuspended : {
        type : Boolean,
        required : true,
        default : false
    },
    totalDue : {
        type : String,
        match : moneyRegEx,
        required : true,
        default : '0.00'
    },
    unpaidBills : [{
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Bill'
    }]
});

phoneAccountSchema.index({
    phoneNumber : 1
}, {
    unique : true,
    partialFilterExpression : { isActive : true }
});

phoneAccountSchema.pre('save', async function() {
    if (!this.currentBill && this.isActive && !this.isSuspended) {
        const now = new Date();
        const bill = new Bill({
            phoneAccount : this._id,
            startDate : now,
            billingPlans : [{
                billingPlan : this.billingPlan,
                startDate : now
            }]
        });
        await bill.save();

        this.currentBill = bill._id;
    }
});

/*phoneAccountSchema.post('findOneAndUpdate', async function(doc) {
    if (this.billingPlan && !this.billingPlan.equals(doc.billingPlan)) {
        const now = Date.now();
        await Bill.updateOne({ 
            _id : doc._id, 
            'billingPlans.endDate' : { $exists : false }
        }, {
            $set : { 'billingPlans.$.endDate' : now },
            $push : {
                billingPlans : {
                    billingPlan : doc.billingPlan,
                    startDate : now
                }
            }
        });
    }
});*/

phoneAccountSchema.plugin(beautify);

module.exports = mongoose.model('PhoneAccount', phoneAccountSchema);