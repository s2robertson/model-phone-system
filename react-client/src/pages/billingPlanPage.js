import React, { useState, useEffect, useCallback } from 'react';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

import useFetchedData from '../hooks/useFetchedData';
import RecordFinder from '../components/recordFinder';
import BillingPlanForm from '../forms/billingPlanForm';

const bpQueryParams = [{ name : 'name', label : 'Name:' }];
const bpMapFunc = ({ _id, name }) => 
    <option value={_id} key={_id}>{name}</option>;

const emptyDoc = {
    name : '',
    pricePerMonth : '0.00',
    pricePerMinute : '0.00',
    isActive : true,
    discountPeriods : []
};

function BillingPlanPage() {
    const [bpId, setBpId] = useState();
    const {
        data : bpData,
        setData : setBpData,
        errorMessage,
        setUrl : doFetch
    } = useFetchedData(null, emptyDoc);

    const saveCallback = useCallback((newData) => {
        setBpId(newData._id);
        setBpData(newData);
    },[setBpData]);

    useEffect(() => {
        if (bpId && bpId !== 'new' && bpId !== bpData._id) {
            doFetch('/api/billingPlans/' + bpId);
        }
    }, [bpId, doFetch]);

    return (
        <Row>
            <Col sm={4}>
                <RecordFinder
                    baseUrl='/api/billingPlans'
                    queryParams={bpQueryParams}
                    mapFunc={bpMapFunc}
                    chooseRecord={setBpId}
                />
            </Col>
            <Col sm={8}>
                {errorMessage ? <span className='text-danger'>{errorMessage}</span> : null}
                <BillingPlanForm 
                    billingPlanId={bpId}
                    initialData={bpData}
                    saveCallback={saveCallback}
                />
            </Col>
        </Row>
    )
}

export default BillingPlanPage;