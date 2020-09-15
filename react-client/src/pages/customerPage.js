import React, { useState, useEffect, useCallback } from 'react';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

import useFetchedData from '../hooks/useFetchedData';
import RecordFinder from '../components/recordFinder';
import CustomerForm from '../forms/customerForm';

const customerQueryParams = [{ name : 'lastName', label : 'Last Name:' }];
const customerMapFunc = ({ _id, firstName, lastName }) => 
    <option value={_id} key={_id}>{`${lastName}, ${firstName}`}</option>;

const emptyDoc = {
    firstName : '',
    lastName : '',
    address : {
        streetAddress : '',
        city : '',
        postalCode : ''
    },
    email : '',
    phoneAccounts : []
};

function CustomerPage(props) {
    const [customerId, setCustomerId] = useState();
    const [customerData, errorMessage, doFetch, setCustomerData] = useFetchedData(null, emptyDoc);

    const saveCallback = useCallback((newData) => {
        setCustomerId(newData._id);
        setCustomerData(newData);
    },[setCustomerData]);
    
    // fetch new data whenever customerId changes
    useEffect(() => {
        if (customerId && customerId !== 'new' && customerId !== customerData._id) {
            doFetch('/api/customers/' + customerId);
        }
    }, [customerId, doFetch]); // doFetch should never change

    return (
        <Row>
            <Col sm={4}>
                <RecordFinder
                    baseUrl="/api/customers"
                    queryParams={customerQueryParams}
                    mapFunc={customerMapFunc}
                    chooseRecord={setCustomerId}
                />
            </Col>
            <Col sm={8}>
                {errorMessage ? <span className='text-danger'>{errorMessage}</span> : null}
                <CustomerForm 
                    customerId={customerId}
                    initialData={customerId === 'new' ? emptyDoc : customerData}
                    saveCallback={saveCallback}
                />
            </Col>
        </Row>
    );
}

export default CustomerPage;
