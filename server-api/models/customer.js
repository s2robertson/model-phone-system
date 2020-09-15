const mongoose = require('mongoose');

const customerSchema = mongoose.Schema({
    firstName : {
        type: String,
        trim : true,
        required : true
    },
    lastName : {
        type : String,
        trim : true,
        required : true
    },
    address : {
        streetAddress : {
            type : String,
            trim : true,
            required : true
        },
        city : {
            type : String,
            trim : true,
            required : true
        },
        postalCode : {
            type : String,
            required : true,
            uppercase : true,
            trim : true,
            match : /[A-Z] *[0-9] *[A-Z] *[0-9] *[A-Z] *[0-9]/
        }
    },
    email : {
        type : String,
        trim : true,
        // borrowed from http://www.regular-expressions.info/email.html
        match : /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
        required : true
    }
}, {
    id : false,
    toJSON : { virtuals : true }
});

customerSchema.virtual('phoneAccounts', {
    ref : 'PhoneAccount',
    localField : '_id',
    foreignField : 'customer'
});

module.exports = mongoose.model("Customer", customerSchema);