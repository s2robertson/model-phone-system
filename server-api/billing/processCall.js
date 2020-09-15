module.exports = function processCall(call, billingPlan) {
    const rawResult = new Map();
    let currentDate = new Date(call.startDate.getTime());
    currentDate.setSeconds(0);
    currentDate.setMilliseconds(0);

    /* The goal is to walk through the discount periods (both daily and week-long),
     * calculating the amount of time spent in each, as well as the amount of time
     * spent in none.  Start by finding the first daily and week-long discount periods
     * that end after the call begins, and the start of the week-long discount periods
     * in general */
    
    let dailyIndex = -1;
    let allWeekStartIndex = -1;
    let allWeekCurrentIndex = -1;
    for (let i = 0; i < billingPlan.discountPeriods.length; i++) {
        const currentPeriod = billingPlan.discountPeriods[i];
        if (dailyIndex === -1 && 
            (currentPeriod.dayOfWeek === currentDate.getDay() &&
                (currentPeriod.endHour > currentDate.getHours() ||
                    (currentPeriod.endHour === currentDate.getHours() &&
                    currentPeriod.endMinute >= currentDate.getMinutes())))) {
            dailyIndex = i;
        }
        else if (dailyIndex === -1 &&
                currentPeriod.dayOfWeek > currentDate.getDay() &&
                currentPeriod.dayOfWeek < 7) {
            dailyIndex = i;
        }
        else if (currentPeriod.dayOfWeek === 7) {
            if (allWeekStartIndex === -1) {
                allWeekStartIndex = i;
            }
            if (allWeekCurrentIndex === -1 && 
                    (currentPeriod.endHour > currentDate.getHours() ||
                        (currentPeriod.endHour === currentDate.getHours() &&
                        currentPeriod.endMinute >= currentDate.getMinutes()))) {
                allWeekCurrentIndex = i;
                break;
            }
        }
    }

    // if there are daily discount periods, but all of them end before the start of the call
    if (dailyIndex === -1 && 
            billingPlan.discountPeriods.length > 0 &&
            (allWeekStartIndex === -1 || allWeekStartIndex > 0)) {
        dailyIndex = 0;
    }
    // if there are week-long discount periods, but all of them end before the start of the call
    if (allWeekCurrentIndex === -1 && allWeekStartIndex !== -1) {
        allWeekCurrentIndex = allWeekStartIndex;
    }

    /* Now we step time forward by transition points (the beginning or ending of a
     * discount period, or the end of the call), until we reach the end of the call */
    while (currentDate < call.endDate) {
        let nextDate = new Date(currentDate.getTime());
        //console.log(`Starting new loop, nextDate = ${nextDate}`);
        let hoursDiff;
        let minutesDiff;
        let currentRate;
        let endingCall = false;

        const currentDailyPeriod = dailyIndex > -1 ? billingPlan.discountPeriods[dailyIndex] : null;

        const inDailyPeriod = currentDailyPeriod && 
            currentDailyPeriod.dayOfWeek === currentDate.getDay() &&
            (currentDailyPeriod.startHour < currentDate.getHours() ||
                (currentDailyPeriod.startHour === currentDate.getHours() &&
                currentDailyPeriod.startMinute <= currentDate.getMinutes())) &&
            (currentDailyPeriod.endHour > currentDate.getHours() ||
                (currentDailyPeriod.endHour === currentDate.getHours() &&
                currentDailyPeriod.endMinute >= currentDate.getMinutes()));

        const currentAllWeekPeriod = allWeekCurrentIndex > -1 ? billingPlan.discountPeriods[allWeekCurrentIndex] : null;

        const inAllWeekPeriod = !inDailyPeriod && currentAllWeekPeriod && 
            (currentAllWeekPeriod.startHour < currentDate.getHours() ||
                (currentAllWeekPeriod.startHour === currentDate.getHours() &&
                currentAllWeekPeriod.startMinute <= currentDate.getMinutes())) &&
            (currentAllWeekPeriod.endHour > currentDate.getHours() ||
                (currentAllWeekPeriod.endHour === currentDate.getHours() &&
                currentAllWeekPeriod.endMinute >= currentDate.getMinutes()));

        if (inDailyPeriod) {
            /* This is the simplest case for determining the next transition.
             * Week-long periods can be ignored because daily discount periods
             * override them.  We either want when the current discount period 
             * ends, or when the call ends. */
            currentRate = currentDailyPeriod.pricePerMinute;
            nextDate.setHours(currentDailyPeriod.endHour);
            nextDate.setMinutes(currentDailyPeriod.endMinute);

            //console.log(`In a daily period from ${currentDate} to ${nextDate}`);

            if (nextDate > call.endDate) {
                nextDate.setHours(call.endDate.getHours());
                nextDate.setMinutes(call.endDate.getMinutes());
                endingCall = true;
            }

            // update the daily discount period
            dailyIndex++;
            if (dailyIndex === billingPlan.discountPeriods.length ||
                    billingPlan.discountPeriods[dailyIndex].dayOfWeek === 7) {
                dailyIndex = 0;
            }

            //console.log('finishing daily period');
        }
        else if (inAllWeekPeriod) {
            /* This case is a little bit more complicated.  The next transition can either
             * be the all week period ending, a daily period beginning, or the call ending */
            currentRate = currentAllWeekPeriod.pricePerMinute;
            nextDate.setHours(currentAllWeekPeriod.endHour);
            nextDate.setMinutes(currentAllWeekPeriod.endMinute);

            //console.log(`In an all-week period from ${currentDate} to ${nextDate}`);
            
            if (currentDailyPeriod && currentDailyPeriod.dayOfWeek === nextDate.getDay()) {
                const periodStart = new Date(currentDate.getTime());
                periodStart.setHours(currentDailyPeriod.startHour);
                periodStart.setMinutes(currentDailyPeriod.startMinute);
                if (periodStart > currentDate && periodStart < nextDate) {
                    nextDate.setHours(currentDailyPeriod.startHour);
                    nextDate.setMinutes(currentDailyPeriod.startMinute - 1);
                }
            }

            if (nextDate > call.endDate) {
                nextDate.setHours(call.endDate.getHours());
                nextDate.setMinutes(call.endDate.getMinutes());
                endingCall = true;
            }

            //console.log('finishing all-week period');
        }
        else {
            /* We're not currently in a discount period.  A transition in this case can be
             * the beginning of a discount period (either all-week or daily), the end of the
             * call, or the end of the current day (not strictly necessary, but it makes things
             * more straightforward). */
            currentRate = billingPlan.pricePerMinute;
            nextDate.setHours(23);
            nextDate.setMinutes(59);
            
            if (currentAllWeekPeriod &&
                (currentAllWeekPeriod.startHour > currentDate.getHours() ||
                    (currentAllWeekPeriod.startHour === currentDate.getHours() &&
                        currentAllWeekPeriod.startMinute > currentDate.getMinutes()))) {
                nextDate.setHours(currentAllWeekPeriod.startHour);
                nextDate.setMinutes(currentAllWeekPeriod.startMinute - 1);
            }

            if (currentDailyPeriod && currentDailyPeriod.dayOfWeek === nextDate.getDay()) {
                const periodStart = new Date(currentDate.getTime());
                periodStart.setHours(currentDailyPeriod.startHour);
                periodStart.setMinutes(currentDailyPeriod.startMinute);
                if (periodStart > currentDate && periodStart < nextDate) {
                    nextDate.setHours(currentDailyPeriod.startHour);
                    nextDate.setMinutes(currentDailyPeriod.startMinute - 1);
                }
            }

            if (nextDate > call.endDate) {
                nextDate.setHours(call.endDate.getHours());
                nextDate.setMinutes(call.endDate.getMinutes());
                endingCall = true;
            }

            //console.log('finishing base period');
        }

        // update the week-long discount period
        let doAllWeekUpdate = allWeekCurrentIndex > -1;
        if (doAllWeekUpdate) {
            /* Compare nextDate against the absolute last all week discount period,
            * so that we don't loop over the all week periods unnecessarily (e.g. if
            * there are a bunch of all week periods early in the day, and a bunch of
            * single day periods late in the day). */
            const lastAllWeekPeriod = billingPlan.discountPeriods[billingPlan.discountPeriods.length - 1];
            if (lastAllWeekPeriod.endHour < nextDate.getHours() ||
                    (lastAllWeekPeriod.endHour === nextDate.getHours() &&
                        lastAllWeekPeriod.endMinute <= nextDate.getMinutes())) {
                allWeekCurrentIndex = allWeekStartIndex;
                doAllWeekUpdate = false;
            }
        }
        while (doAllWeekUpdate) {
            const nextAllWeekPeriod = billingPlan.discountPeriods[allWeekCurrentIndex];
            if (nextAllWeekPeriod.endHour > nextDate.getHours() ||
                    (nextAllWeekPeriod.endHour === nextDate.getHours() &&
                    nextAllWeekPeriod.endMinute > nextDate.getMinutes)) {
                break;
            }
            allWeekCurrentIndex++;
            if (allWeekCurrentIndex === billingPlan.discountPeriods.length) {
                allWeekCurrentIndex = allWeekStartIndex;
                break;
            }
        }

        /* Calculate the duration of the current period.  Transitions are structured 
         * to not cross midnight */
        hoursDiff = nextDate.getHours() - currentDate.getHours();
        minutesDiff = hoursDiff > 0 ? 
            60 * (hoursDiff - 1) + 60 - currentDate.getMinutes() + nextDate.getMinutes() + 1 :
            nextDate.getMinutes() - currentDate.getMinutes() + 1;

        if (endingCall && call.endDate.getSeconds() === 0) {
            minutesDiff--;
        }
            
        let tempSum = rawResult.get(currentRate);
        if (tempSum === undefined) {
            tempSum = minutesDiff;
        }
        else {
            tempSum += minutesDiff;
        }
        rawResult.set(currentRate, tempSum);
        //console.log(`Setting currentDate to ${nextDate}`);
        currentDate.setTime(nextDate.getTime());
        currentDate.setMinutes(currentDate.getMinutes() + 1);
    }

    const result = Array.from(rawResult, ([key, value]) => ({
        rate : key,
        duration : value
    }));
    call.charges = result;
}