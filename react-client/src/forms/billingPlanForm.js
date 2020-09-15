import React, { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';

import { Formik, Form, FieldArray } from 'formik';
import FullField from '../components/fullField';
import * as Yup from 'yup';

const moneyRegEx = /^\$?((\d{1,3}([, ]\d{3})*)|(\d+))(\.\d{1,2})?$/;
const timeRegEx = /\d{2}:\d{2}/;

const emptyDiscountPeriod = {
    dayOfWeek : '0',
    startTime : '00:00',
    endTime : '00:00',
    pricePerMinute : '0.00'
};

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
        if (first.startHour < first.endHour && first.startMinute <= second.startMinute) {
            return true;
        }
        else if (first.startHour === first.endHour && first.startMinute <= second.startMinute && second.startMinute <= first.endMinute) {
            return true;
        }
    }
    else if (second.startHour === first.endHour && second.startMinute < first.endMinute) {
        return true;
    }
    return false;
}

/**
 * Performs additional validation on discount periods to ensure they don't overlap
 * @param {*} values 
 */
function validateDiscountPeriods(values) {
    // console.log('In validateDiscountPeriods');
    if (values.discountPeriods && values.discountPeriods.length > 0) {
        const errorArray = [];
        const timeObjs = [];

        // first, verify that all the discount periods are valid, and transform them into an easier format to work with
        values.discountPeriods.forEach((discountPeriod) => {
            // console.log(`Checking discount period : ${JSON.stringify(discountPeriod)}`);
            let [startHour, startMinute] = discountPeriod.startTime.split(':');
            startHour = parseInt(startHour);
            startMinute = parseInt(startMinute);

            let [endHour, endMinute] = discountPeriod.endTime.split(':');
            endHour = parseInt(endHour);
            endMinute = parseInt(endMinute);

            let error;
            // if a time field has been blanked out or otherwise made invalid, rely on validationSchema instead of custom logic
            if (!(isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute))) {
                // make sure start time and end time are in order
                if (endHour < startHour || (startHour === endHour && endMinute <= startMinute)) {
                    error = {
                        endTime : 'End time must be later than start time'
                    };
                }
                timeObjs.push({
                    startHour, startMinute, endHour, endMinute,
                    dayOfWeek : parseInt(discountPeriod.dayOfWeek)
                });
            }
            errorArray.push(error);
        });

        // console.log(`At end of first step, errorArray = ${JSON.stringify(errorArray)}`);
        // console.log(`At end of first step, timeObjs = ${JSON.stringify(timeObjs)}`);

        // if any errors have been found, bail out
        if (errorArray.length !== timeObjs.length || errorArray.some((val) => val !== undefined)) {
            return {
                discountPeriods : errorArray
            };
        }

        // now make sure no discount periods overlap
        for (let x = 0; x < timeObjs.length; x++) {
            for (let y = x + 1; y < timeObjs.length; y++) {
                if (timeObjs[x].dayOfWeek === timeObjs[y].dayOfWeek) {
                    if (dpConflictHelper(timeObjs[x], timeObjs[y]) || dpConflictHelper(timeObjs[y], timeObjs[x])) {
                        return {
                            discountPeriods : 'Discount periods may not overlap (except for single-day periods overriding all-week periods)'
                        };
                    }
                }
            }
        }
    }

    return {};
}

const schema = Yup.object({
    name : Yup.string()
        .required('Required'),
    pricePerMonth : Yup.string()
        .ensure()
        .trim()
        .matches(moneyRegEx, 'Must be a number, optionally with two decimal places')
        .required('Required'),
    pricePerMinute : Yup.string()
        .ensure()
        .trim()
        .matches(moneyRegEx, 'Must be a number, optionally with two decimal places')
        .required('Required'),
    discountPeriods : Yup.array()
        .of(Yup.object({
            dayOfWeek : Yup.number()
                .min(0, 'Invalid day of the week') // 0 represents Sunday
                .max(7, 'Invalid day of the week') // 6 represents Saturday,  7 represents all days of the week
                .required('Required'),
            startTime : Yup.string()
                .ensure()
                .trim()
                .matches(timeRegEx, 'Must be a time in the form hh:mm')
                .required('Required'),
            endTime : Yup.string()
                .ensure()
                .trim()
                .matches(timeRegEx, 'Must be a time in the form hh:mm')
                .required('Required'),
            pricePerMinute : Yup.string()
                .ensure()
                .trim()
                .matches(moneyRegEx, 'Must be a number, optionally with two decimal places')
                .required('Required')
        }))
});

function BillingPlanForm({ billingPlanId, initialData, saveCallback, ...props }) {
    const [saveError, setSaveError] = useState(null);
    return (
        <Formik
            initialValues={initialData}
            validationSchema={schema}
            validate={validateDiscountPeriods}
            onSubmit={async (values, { setSubmitting }) => {
                let path;
                let method;
                if (billingPlanId === 'new') {
                    path = '/api/billingPlans'
                    method = 'POST'
                }
                else {
                    path = `/api/billingPlans/${billingPlanId}`;
                    method = 'PATCH';
                }

                const response = await fetch(path, {
                    method,
                    headers : {
                        'Content-Type' : 'application/json'
                    },
                    body : JSON.stringify(values)
                });
                const body = await response.json();

                if (response.ok) {
                    saveCallback(body);
                    setSaveError(null);
                }
                else {
                    setSaveError(body.error);
                }

                setSubmitting(false);
            }}
            enableReinitialize={true}
        >
            {({ values, errors }) => (
                <Form>
                    {saveError ? <span className='text-danger'>{saveError}</span> : null}
                    <FullField
                        label="Billing Plan Name:"
                        name="name"
                    />
                    <FullField 
                        label="Monthly Price:"
                        name="pricePerMonth"
                        type="number"
                        step="0.01"
                        prepend='$'
                    />
                    <FullField
                        label="Price per Minute:"
                        name="pricePerMinute"
                        type="number"
                        step="0.01"
                        prepend='$'
                    />
                    <FieldArray name="discountPeriods">
                        {(arrayHelpers) => (
                            <div className='mb-3'>
                                {values.discountPeriods && values.discountPeriods.length > 0 ? (
                                    values.discountPeriods.map((discountPeriod, index) => (
                                        <Container className='border rounded mb-3 py-2' key={index}>
                                            <FullField
                                                label="Day of Week:"
                                                name={`discountPeriods.${index}.dayOfWeek`}
                                                type="select"
                                                custom
                                            >
                                                <option value='0'>Sunday</option>
                                                <option value='1'>Monday</option>
                                                <option value='2'>Tuesday</option>
                                                <option value='3'>Wednesday</option>
                                                <option value='4'>Thursday</option>
                                                <option value='5'>Friday</option>
                                                <option value='6'>Saturday</option>
                                                <option value='7'>All days</option>
                                            </FullField>
                                            <FullField
                                                label="Start Time:"
                                                name={`discountPeriods.${index}.startTime`}
                                                type="time"
                                                step="60"
                                            />
                                            <FullField
                                                label="End Time:"
                                                name={`discountPeriods.${index}.endTime`}
                                                type="time"
                                                step="60"
                                            />
                                            <FullField
                                                label="Price per Minute:"
                                                name={`discountPeriods.${index}.pricePerMinute`}
                                                type="number"
                                                step="0.01"
                                                prepend='$'
                                            />
                                            <Button 
                                                type="button"
                                                onClick={() => arrayHelpers.remove(index)}
                                            >
                                                Remove
                                            </Button>
                                        </Container>
                                    ))
                                ) : null}
                                <Button
                                    type="button"
                                    onClick={() => arrayHelpers.push(emptyDiscountPeriod)}
                                >
                                    Add Discount Period
                                </Button>
                            </div>
                        )}
                    </FieldArray>
                    {typeof errors.discountPeriods === 'string' ? (
                        <span className='text-danger'>{errors.discountPeriods}</span>
                    ) : null}
                    <Button type='submit'>Save Changes</Button>
                </Form>
            )}
        </Formik>
    );
}

export default BillingPlanForm;
