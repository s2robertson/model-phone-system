const mongoose = require('mongoose');
const { moneyRegEx } = require('../helpers/stringHelper');

const discountPeriodSchema = mongoose.Schema({
    dayOfWeek : {
        type : Number,
        min : 0, // 0-6 = Sunday - Saturday
        max : 7, // 7 = all days of the week
        required : true
    },
    startHour : {
        type : Number,
        min : 0,
        max : 23,
        required : true
    },
    startMinute : {
        type : Number,
        min : 0,
        max : 59,
        required : true
    },
    endHour : {
        type : Number,
        min : 0,
        max : 23,
        required : true
    },
    endMinute : {
        type : Number,
        min : 0,
        max : 59,
        required : true
    },
    pricePerMinute : {
        type : String,
        trim : true,
        match : moneyRegEx,
        required : true
    }
}, {
    _id : false,
    id : false,
    toJSON : {
        virtuals : true
    }
});

/**
 * Helper method for converting hour/minute combinations into a format suitable for html time inputs
 * @param {*} hour 
 * @param {*} minute 
 */
function timeToString(hour, minute) {
    const hourStr = typeof hour === 'number' ? hour.toString() : hour;
    const minuteStr = typeof minute === 'number' ? minute.toString() : minute;
    return `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}`;
}

discountPeriodSchema.virtual('startTime')
    .get(function() {
        return timeToString(this.startHour, this.startMinute);
    })
    .set(function(val) {
        [this.startHour, this.startMinute] = val.split(':');
    });

discountPeriodSchema.virtual('endTime')
    .get(function() {
        return timeToString(this.endHour, this.endMinute);
    })
    .set(function(val) {
        [this.endHour, this.endMinute] = val.split(':');
    });

discountPeriodSchema.pre('validate', function(next) {
    // error out if start time == end time
    if (this.startHour === this.endHour && this.startMinute === this.endMinute) {
        const err = new Error(`Discount period start and end times are the same: ${this.startHour}:${this.startMinute}`);
        return next(err);
    }

    // if "start time" is after "end time", switch them
    if (this.startHour > this.endHour || 
            (this.startHour === this.endHour && this.startMinute > this.endMinute)) {
        [this.startHour, this.endHour] = [this.endHour, this.startHour];
        [this.startMinute, this.endMinute] = [this.endMinute, this.startMinute];
    }

    next();
});

/**
 * Helper method for determining if there is a conflict between discount periods.
 * Checks if the second period starts within the first.
 * A return value of true indicates that there IS a a conflict.
 * @param {*} first 
 * @param {*} second 
 */
function dpConflictHelper(first, second) {
    if (first.startHour < second.startHour && second.startHour < first.endHour) {
        return true;
    }
    else if (first.startHour === second.startHour) {
        if (first.startHour !== first.endHour && first.startMinute <= second.startMinute) {
            return true;
        }
        else if (first.startHour === first.endHour && first.startMinute <= second.startMinute && second.startMinute <= first.endMinute) {
            return true;
        }
    }
    else if (second.startHour === first.endHour && second.startMinute <= first.endMinute) {
        return true;
    }
    return false;
}

const billingPlanSchema = mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    pricePerMonth : {
        type : String,
        trim : true,
        match : moneyRegEx,
        required : true
    },
    pricePerMinute : {
        type : String,
        trim : true,
        match : moneyRegEx,
        required : true
    },
    discountPeriods : {
        type : [discountPeriodSchema],
        validate : {
            validator : function(arr) {
                // make sure discount periods don't overlap
                for (let x = 0; x < arr.length; x++) {
                    for (let y = x + 1; y < arr.length; y++) {
                        if (arr[x].dayOfWeek === arr[y].dayOfWeek && 
                                (dpConflictHelper(arr[x], arr[y]) || dpConflictHelper(arr[y], arr[x]))) {
                            return false;
                        }
                    }
                }
                return true;
            },
            message : "Discount periods may not overlap (except for single-day periods overriding all-week periods)"
        }
    },
    isActive : {
        type : Boolean,
        default : true,
        required : true
    }
});

/* Keeping discount periods sorted saves a headache when billing calls */

function compareDiscountPeriods(a, b) {
    if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
    }
    else if (a.startHour !== b.startHour) {
        return a.startHour - b.startHour;
    }
    else if (a.startMinute !== b.startMinute) {
        return a.startMinute - b.startMinute;
    }
    return 0;
}

billingPlanSchema.pre('save', function(next) {
    if (this.discountPeriods.length > 0) {
        this.discountPeriods.sort(compareDiscountPeriods);
    }
    next();
});

billingPlanSchema.pre('findOneAndUpdate', function(next) {
    const discountPeriods = this.get('discountPeriods');
    if (discountPeriods && discountPeriods.length > 0) {
        discountPeriods.sort(compareDiscountPeriods);
    }
    next();
});

module.exports = mongoose.model('BillingPlan', billingPlanSchema);
