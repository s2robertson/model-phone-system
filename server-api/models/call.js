const mongoose = require('mongoose');
const { moneyRegEx } = require('../helpers/stringHelper');

const chargeSchema = mongoose.Schema({
    duration : {
        type : Number,
        min : 1,
        required : true
    },
    rate : {
        type : String,
        trim : true,
        match : moneyRegEx,
        required : true
    }
}, {
    _id : false,
    id : false
});

const callSchema = mongoose.Schema({
    callerBill : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Bill',
        required : true
    },
    calleeNumber : {
        type : String,
        match : [/\d{4}/, 'Phone numbers must be four digits'],
        required : true
    },
    startDate : {
        type : Date,
        default : Date.now,
        required : true
    },
    endDate : Date,
    charges : [chargeSchema]
});

module.exports = mongoose.model('Call', callSchema);
