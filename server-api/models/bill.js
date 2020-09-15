const mongoose = require('mongoose');
const { moneyRegEx } = require('../helpers/stringHelper');

const billingPlanChangeSchema = mongoose.Schema({
    billingPlan : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'BillingPlan',
        required : true
    },
    startDate : {
        type : Date,
        default : Date.now,
        required : true
    },
    endDate : Date,
    amountDue : {
        type : String,
        trim : true,
        match : moneyRegEx
    }
}, {
    _id : false,
    id : false
});

const billSchema = mongoose.Schema({
    startDate : {
        type : Date,
        default : Date.now,
        required : true
    },
    endDate : Date,
    phoneAccount : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'PhoneAccount',
        required : true
    },
    billingPlans : {
        type : [billingPlanChangeSchema],
        validate : {
            validator :  function (arr) {
                return arr && arr.length > 0
            },
            message : 'A bill must have a billing plan'
        }
    },
    totalDue : {
        type : String,
        trim : true,
        match : moneyRegEx
    }
}, {
    id : false,
    toJSON : { virtuals : true }
});

billSchema.virtual('calls', {
    ref : 'Call',
    localField : '_id',
    foreignField : 'callerBill',
    options : {
        sort : { startDate : 1 }
    }
})

billSchema.index({
    endDate : 1,
    startDate : 1
}/*, {
    partialFilterExpression : { endDate : { $exists : false }}      // mongodb doesn't support this
}*/);

module.exports = mongoose.model('Bill', billSchema);