import React, { useState, useEffect, useCallback } from 'react';
import BillModal from '../components/billModal';
import Button from 'react-bootstrap/Button';

import { Formik, Form, FieldArray } from 'formik';
import FullField from '../components/fullField';
import ArrayNavigator from '../components/arrayNavigator';
import * as Yup from 'yup';

import useFetchedData from '../hooks/useFetchedData'

const moneyRegEx = /^((\$?\-?)|(\-?\$?))((\d{1,3}([, ]\d{3})*)|(\d+))(\.\d{1,2})?$/;

const schema = Yup.object({
    firstName : Yup.string()
        .ensure()
        .max(20, 'Must be 20 characters or less')
        .required('Required'),
    lastName : Yup.string()
        .ensure()
        .max(20, 'Must be 20 characters or less')
        .required('Required'),
    address : Yup.object({
        streetAddress : Yup.string()
            .ensure()
            .required('Required'),
        city : Yup.string()
            .ensure()
            .required('Required'),
        postalCode : Yup.string()
            .ensure()
            .required('Required'),
    }),
    email : Yup.string()
        .ensure()
        .email('Invalid email address')
        .required('Required'),
    phoneAccounts : Yup.array(Yup.object({
        phoneNumber : Yup.string()
            .ensure()
            .matches(/(\d{4})|(####)/, 'Must be a four-digit number, or \'####\'')
            .required('Required'),
        billingPlan : Yup.object({
            _id : Yup.string()
                .ensure()
                .trim()
                .required('Required')
        }),
        makePayment : Yup.string()
            .matches(moneyRegEx, 'Must be a number, optionally with two decimal places')
    }))
});

function CustomerForm({ customerId, initialData, saveCallback, ...props }) {
    /* Get a list of billing plans, and incorporate the customer's billing plan(s) 
     * into it if necessary (caused by the customer having a deactivated plan) */
    const [baseBillingPlans, bpErr] = useFetchedData('/api/billingPlans');
    const [billingPlanLists, setBpLists] = useState([]);
    useEffect(() => {
        //console.log(`In the bpLists effect hook.  baseBillingPlans=${JSON.stringify(baseBillingPlans)}`);
        //console.log(`initialData = ${JSON.stringify(initialData)}`)
        if (!baseBillingPlans || !initialData || !(initialData.phoneAccounts instanceof Array)) {
            //console.log('Bailing out!');
            return;
        }
        
        const lists = [];
        if (bpErr) {
            //console.log(`In the error case.  bpErr=${bpErr}`);
            for (let i = 0; i < initialData.phoneAccounts.length; i++) {
                lists.push([{ _id : 'error', name : 'Error' }]);
            }
        }
        else {
            /* Establish a map from a billing plan id to a list of billing plans that contains it.
             * The goal is to avoid building a new list unless it's necessary. */
            const m = new Map();
            for (const billingPlan of baseBillingPlans) {
                m.set(billingPlan._id, baseBillingPlans);
            }
            for (const phoneAccount of initialData.phoneAccounts) {
                if (!phoneAccount.billingPlan) {
                    // this shouldn't happen, but just in case
                    lists.push([{ _id : 'error', name : 'Error' }]);
                    continue;
                }

                const existing = m.get(phoneAccount.billingPlan._id);
                if (existing) {
                    lists.push(existing);
                }
                else {
                    const bpCopy = {...phoneAccount.billingPlan};
                    bpCopy.name += ' (retired)';
                    const newList = baseBillingPlans.slice();
                    newList.push(bpCopy);
                    m.set(bpCopy._id, newList);
                    lists.push(newList);
                }
            }
        }
        //console.log(`Setting bpLists: ${JSON.stringify(lists)}`);
        setBpLists(lists);
    }, [initialData, baseBillingPlans, bpErr]);

    const [emptyPhoneAccount, setEmptyPA] = useState({
        _id : 'new',
        phoneNumber : '####',
        billingPlan : '',
        closeAccount : false,
        isSuspended : false,
        totalDue : '0.00',
        makePayment : '0.00'
    });

    /* if billingPlan._id isn't set on emptyPhoneAccount, the user will need to change the select
     * before it registers. */
    useEffect(() => {
        if (baseBillingPlans && baseBillingPlans[0]) {
            setEmptyPA((emptyPA) => ({
                ...emptyPA,
                billingPlan : { _id : baseBillingPlans[0]._id }
            }));
        }
    }, [baseBillingPlans]);

    // Phone accounts need to display a list of bills
    const [showingBillModal, setShowingBillModal] = useState(false);
    const [billList, billListError, fetchBills] = useFetchedData();
    const hideBillModalCallback = useCallback(() => setShowingBillModal(false), []);
    
    const [saveError, setSaveError] = useState(null);

    //console.log(`billingPlanLists = ${JSON.stringify(billingPlanLists)}`);
    return (
        <Formik
            initialValues={initialData}
            validationSchema={schema}
            onSubmit={async (values, { setSubmitting }) => {
                let path;
                let method;
                if (customerId === 'new') {
                    path = '/api/customers';
                    method = 'POST';
                }
                else {
                    path = `/api/customers/${customerId}`;
                    method = 'PATCH';
                }
                //console.log(`${method}ing: ${JSON.stringify(values)}`);
                const response = await fetch(path, {
                    method,
                    headers : {
                        'Content-Type': 'application/json'
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
            {({ values, errors, isSubmitting }) => (
                <Form>
                    {saveError && <span className='text-danger'>{saveError}</span>}
                    <FullField
                        label="First Name:"
                        name="firstName"
                    />
                    <FullField
                        label="Last Name:"
                        name="lastName"
                    />
                    <FullField
                        label="Street Address:"
                        name="address.streetAddress"
                    />
                    <FullField
                        label="City:"
                        name="address.city"
                    />
                    <FullField
                        label="Postal Code:"
                        name="address.postalCode"
                    /> {/* to do: regex validation */}
                    <FullField
                        label="Email:"
                        name="email"
                        type="email"
                    />
                    <FieldArray name="phoneAccounts">
                        {({ push : addPhoneAccount, remove : removePhoneAccount }) => (
                            <ArrayNavigator
                                arrayLength={values.phoneAccounts ? values.phoneAccounts.length : 0}
                                mainTitle="Phone Accounts"
                                canMove={(index) => (errors.phoneAccounts === undefined || errors.phoneAccounts[index] === undefined)}
                                canAdd={(index) => (baseBillingPlans && (errors.phoneAccounts === undefined || errors.phoneAccounts[index] === undefined))}
                                addCallback={() => {
                                    addPhoneAccount({...emptyPhoneAccount});
                                    setBpLists(prev => {
                                        const res = prev.slice();
                                        res.push(!bpErr ? baseBillingPlans : [{ _id : 'error', name : 'Error' }]);
                                        return res;
                                    });
                                }}
                                canRemove={(index) => values.phoneAccounts && values.phoneAccounts.length > 0 && values.phoneAccounts[index]._id === 'new'}
                                removeCallback={(index) => {
                                    removePhoneAccount(index);
                                    setBpLists(prev => prev.filter((val, i) => i !== index));
                                }}
                            >
                                {(index) => (
                                    <>
                                        <FullField
                                            label="Phone Number:"
                                            name={`phoneAccounts.${index}.phoneNumber`}
                                        />
                                        <FullField
                                            label="Billing Plan:"
                                            name={`phoneAccounts.${index}.billingPlan._id`}
                                            type="select"
                                            custom
                                        >
                                            {billingPlanLists && billingPlanLists[index] ? 
                                                billingPlanLists[index].map((entry) => <option value={entry._id} key={entry._id}>{entry.name}</option>)
                                                : null
                                            }
                                        </FullField>
                                        {values.phoneAccounts[index]._id !== 'new' ?
                                            <>
                                                <FullField
                                                    label='Amount due:'
                                                    name={`phoneAccounts.${index}.totalDue`}
                                                    prepend='$'
                                                    disabled
                                                />
                                                {values.phoneAccounts[index].isSuspended && <span className='text-danger'>(Currently suspended for non-payment)</span>}
                                                <FullField
                                                    label='Make payment:'
                                                    name={`phoneAccounts.${index}.makePayment`}
                                                    type='number'
                                                    step='0.01'
                                                    prepend='$'
                                                />
                                                <FullField
                                                    label='Close Account'
                                                    name={`phoneAccounts.${index}.closeAccount`}
                                                    type='checkbox'
                                                />
                                                <Button 
                                                    type='button'
                                                    variant='primary'
                                                    onClick={() => {
                                                        fetchBills(`/api/phoneAccounts/${values.phoneAccounts[index]._id}/bills`);
                                                        setShowingBillModal(true);
                                                    }}
                                                    className='my-2'
                                                >
                                                    View Bills
                                                </Button>
                                                <BillModal
                                                    show={showingBillModal}
                                                    phoneNumber={values.phoneAccounts[index].phoneNumber}
                                                    billList={billList}
                                                    billListError={billListError}
                                                    onHide={hideBillModalCallback}
                                                />
                                            </>
                                            : null
                                        }
                                    </>
                                )}
                            </ArrayNavigator>
                        )}
                    </FieldArray>
                    <Button type="submit" disabled={isSubmitting}>Save Changes</Button>
                </Form>
            )}
        </Formik>
    );
}

export default CustomerForm;
