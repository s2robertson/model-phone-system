const processCall = require('./processCall');

test('no discount periods', () => {
    const startDate = new Date();
    startDate.setHours(7);
    startDate.setMinutes(0);

    const endDate = new Date();
    endDate.setHours(8);
    endDate.setMinutes(29);
    endDate.setSeconds(20);

    const call = {
        startDate,
        endDate
    };

    const billingPlan = {
        pricePerMinute : '0.10',
        discountPeriods : []
    };

    processCall(call, billingPlan);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 90 });
});

test('unused daily discount period', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 12,
            startMinute : 0,
            endHour : 13,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 90 });
});

test('unused all week discount period', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 12,
            startMinute : 0,
            endHour : 13,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 90 });
});

test('call entirely in daily period', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 0,
            startMinute : 0,
            endHour : 12,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 90 });
});

test('call entirely in all week period', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 9, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 0,
            startMinute : 0,
            endHour : 12,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 150 });
});

test('base to daily period transition', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 8,
            startMinute : 0,
            endHour : 12,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 30 });
});

test('base to all week period transition', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 8,
            startMinute : 0,
            endHour : 12,
            endMinute : 0,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 30 });
});

test('daily period to base transition', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 0,
            startMinute : 0,
            endHour : 7,
            endMinute : 59,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 30 });
});

test('daily period to daily period transition', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 0,
            startMinute : 0,
            endHour : 7,
            endMinute : 59,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 0,
            startHour : 8,
            startMinute : 0,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.06'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.06', duration : 30 });
});

test('daily period to all week period transition', () => {
    const startDate = new Date(2020, 6, 19, 7, 0);
    const endDate = new Date(2020, 6, 19, 8, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 0,
            startMinute : 0,
            endHour : 7,
            endMinute : 59,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 7,
            startHour : 8,
            startMinute : 0,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.06'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.06', duration : 30 });
});

test('all week period to base transition', () => {
    const startDate = new Date(2020, 6, 19, 9, 10);
    const endDate = new Date(2020, 6, 19, 10, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.20',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 8,
            startMinute : 0,
            endHour : 9,
            endMinute : 59,
            pricePerMinute : '0.07'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.07', duration : 50 });
    expect(call.charges).toContainEqual({ rate : '0.20', duration : 30 });
});

test('all week period to daily period transition', () => {
    const startDate = new Date(2020, 6, 19, 9, 10);
    const endDate = new Date(2020, 6, 19, 10, 34, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 10,
            startMinute : 0,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 7,
            startHour : 8,
            startMinute : 0,
            endHour : 9,
            endMinute : 59,
            pricePerMinute : '0.06'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.06', duration : 50 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 35 });
});

test('all week period to all week period transition', () => {
    const startDate = new Date(2020, 6, 19, 9, 0);
    const endDate = new Date(2020, 6, 19, 10, 39, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 0,
            startMinute : 0,
            endHour : 9,
            endMinute : 29,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 7,
            startHour : 9,
            startMinute : 30,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.06'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 30 });
    expect(call.charges).toContainEqual({ rate : '0.06', duration : 70 });
});

test('daily period inside all week period', () => {
    const startDate = new Date(2020, 6, 19, 9, 0);
    const endDate = new Date(2020, 6, 19, 10, 59, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 10,
            startMinute : 0,
            endHour : 10,
            endMinute : 29,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 7,
            startHour : 9,
            startMinute : 30,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.06'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(3);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 30 });
    expect(call.charges).toContainEqual({ rate : '0.06', duration : 60 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 30 });
});

test('many early all week periods', () => {
    const startDate = new Date(2020, 6, 19, 9, 10);
    const endDate = new Date(2020, 6, 19, 11, 34, 20);

    const call = {
        startDate,
        endDate
    };

    const bp = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 9,
            startMinute : 0,
            endHour : 9,
            endMinute : 29,
            pricePerMinute : '0.01'
        },{
            dayOfWeek : 0,
            startHour : 9,
            startMinute : 30,
            endHour : 9,
            endMinute : 59,
            pricePerMinute : '0.02'
        }, {
            dayOfWeek : 0,
            startHour : 10,
            startMinute : 0,
            endHour : 10,
            endMinute : 29,
            pricePerMinute : '0.01'
        }, {
            dayOfWeek : 0,
            startHour : 10,
            startMinute : 30,
            endHour : 10,
            endMinute : 39,
            pricePerMinute : '0.03'
        }, {
            dayOfWeek : 0,
            startHour : 10,
            startMinute : 41,
            endHour : 10,
            endMinute : 59,
            pricePerMinute : '0.04'
        }, {
            dayOfWeek : 0,
            startHour : 11,
            startMinute : 0,
            endHour : 11,
            endMinute : 59,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 7,
            startHour : 0,
            startMinute : 0,
            endHour : 0,
            endMinute : 10,
            pricePerMinute : '0.06'
        }, {
           dayOfWeek : 7,
           startHour : 0,
           startMinute : 11,
           endHour : 0,
           endMinute : 23,
           pricePerMinute : '0.07' 
        }, {
            dayOfWeek : 7,
            startHour : 0,
            startMinute : 24,
            endHour : 0,
            endMinute : 59,
            pricePerMinute : '0.08'
        }, {
            dayOfWeek : 7,
            startHour : 1,
            startMinute : 0,
            endHour : 1,
            endMinute : 10,
            pricePerMinute : '0.09'
        }, {
            dayOfWeek : 7,
            startHour : 2,
            startMinute : 0,
            endHour : 2,
            endMinute : 59,
            pricePerMinute : '0.01'
        }]
    };

    processCall(call, bp);

    expect(call.charges).toHaveLength(6);
    expect(call.charges).toContainEqual({ rate : '0.01', duration : 50 });
    expect(call.charges).toContainEqual({ rate : '0.02', duration : 30 });
    expect(call.charges).toContainEqual({ rate : '0.03', duration : 10 });
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 1 });
    expect(call.charges).toContainEqual({ rate : '0.04', duration : 19 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 35 });
});

test('basic over midnight', () => {
    const startDate = new Date(2020, 6, 19, 23, 30);
    const endDate = new Date(2020, 6, 20, 0, 14, 20);

    const call = {
        startDate,
        endDate
    };

    const billingPlan = {
        pricePerMinute : '0.10',
        discountPeriods : []
    };

    processCall(call, billingPlan);

    expect(call.charges).toHaveLength(1);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 45 });
});

test('over midnight with daily periods', () => {
    const startDate = new Date(2020, 6, 19, 23, 30);
    const endDate = new Date(2020, 6, 20, 0, 29, 20);

    const call = {
        startDate,
        endDate
    };

    const billingPlan = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 0,
            startHour : 12,
            startMinute : 0,
            endHour : 13,
            endMinute : 0,
            pricePerMinute : '0.05'
        }, {
            dayOfWeek : 1,
            startHour : 0,
            startMinute : 0,
            endHour : 1,
            endMinute : 0,
            pricePerMinute : '0.04'
        }]
    };

    processCall(call, billingPlan);

    expect(call.charges).toHaveLength(2);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 30 });
    expect(call.charges).toContainEqual({ rate : '0.04', duration : 30 });
});

test('over midnight with all-week periods', () => {
    const startDate = new Date(2020, 6, 19, 23, 0);
    const endDate = new Date(2020, 6, 20, 0, 59, 20);

    const call = {
        startDate,
        endDate
    };

    const billingPlan = {
        pricePerMinute : '0.10',
        discountPeriods : [{
            dayOfWeek : 7,
            startHour : 0,
            startMinute : 15,
            endHour : 3,
            endMinute : 0,
            pricePerMinute : '0.04'
        }, {
            dayOfWeek : 7,
            startHour : 20,
            startMinute : 0,
            endHour : 23,
            endMinute : 29,
            pricePerMinute : '0.05'
        }]
    };

    processCall(call, billingPlan);

    expect(call.charges).toHaveLength(3);
    expect(call.charges).toContainEqual({ rate : '0.10', duration : 45 });
    expect(call.charges).toContainEqual({ rate : '0.05', duration : 30 });
    expect(call.charges).toContainEqual({ rate : '0.04', duration : 45 });
});
