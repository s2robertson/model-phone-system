import React, { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import ListGroup from 'react-bootstrap/ListGroup';
import Table from 'react-bootstrap/Table';
import Button from 'react-bootstrap/Button';

import useFetchedData from '../hooks/useFetchedData';

const dateLongFormatter = new Intl.DateTimeFormat('en', { dateStyle : 'long' });
const dateOnlyFormatter = new Intl.DateTimeFormat('en', { dateStyle : 'short' });
const dateTimeFormatter = new Intl.DateTimeFormat('en', { dateStyle : 'short', timeStyle : 'short'});

function BillModal({ show, phoneNumber, billList, billListError, onHide, animation=false }) {
    const [showingList, setShowingList] = useState(true);
    const [billData, billError, fetchBill] = useFetchedData();

    // when the list of bills gets changed, default to showing it
    useEffect(() => {
        setShowingList(true);
    }, [billList]);

    const setBillId = (_id) => {
        if (billData && billData._id === _id) {
            setShowingList(false);
        }
        else {
            fetchBill(`/api/bills/${_id}`);
        }
    }
    useEffect(() => {
        setShowingList(billData === null || billData === undefined);
    }, [billData]);

    return (
        <Modal
            show={show}
            onHide={onHide}
            animation={animation}
        >
            <Modal.Header closeButton>
                <Modal.Title>{showingList ? 
                    `Bills for ${phoneNumber}` 
                    : 
                    (billData && `${dateLongFormatter.format(new Date(billData.startDate))} to ${dateLongFormatter.format(new Date(billData.endDate))}`)
                }</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {billListError && <span className='text-danger'>{billListError}</span>}
                {billError && <span className='text-danger'>{billError}</span>}
                {showingList ?
                    <ListGroup>
                        {billList && billList.map((bill) => (
                            <ListGroup.Item 
                                key={bill._id}
                                action
                                onClick={() => setBillId(bill._id)}
                            >
                                {dateLongFormatter.format(new Date(bill.endDate)) + ' ' + (bill.totalDue.indexOf('$') > -1 ? bill.totalDue : '$' + bill.totalDue)}
                            </ListGroup.Item>
                        ))}
                    </ListGroup>
                    :
                    <>
                        <h5>Billing Plans:</h5>
                        <Table striped responsive='sm'>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Charge</th>
                                </tr>
                            </thead>
                            <tbody>
                                {billData && billData.billingPlans.map((bpEntry) => (
                                    <tr key={bpEntry.startDate}>
                                        <td>{bpEntry.billingPlan.name}</td>
                                        <td>{dateOnlyFormatter.format(new Date(bpEntry.startDate))}</td>
                                        <td>{dateOnlyFormatter.format(new Date(bpEntry.endDate))}</td>
                                        <td>{bpEntry.amountDue}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <h5>Calls:</h5>
                        <Table striped responsive='sm'>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th># Dialed</th>
                                    <th>Charge(s)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {billData && billData.calls.map((call) => (
                                    <tr key={call._id}>
                                        <td>{dateTimeFormatter.format(new Date(call.startDate))}</td>
                                        <td>{call.calleeNumber}</td>
                                        <td>
                                            {call.charges.map((charge, index) => (
                                                <React.Fragment key={charge.rate}>
                                                    {index > 0 && <br/>}
                                                    {charge.duration + ' min @ ' + (charge.rate.indexOf('$') > -1 ? charge.rate : '$' + charge.rate) + '/min'}
                                                </React.Fragment>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <p style={{fontWeight: 'bold'}}>
                            Total Due: {billData && billData.totalDue ? (billData.totalDue.indexOf('$') > -1 ? billData.totalDue : '$' + billData.totalDue) : '$0.00'}
                        </p>
                    </>
                }
            </Modal.Body>
            {!showingList && (
                <Modal.Footer>
                    <Button 
                        type='button' 
                        variant='primary'
                        onClick={() => setShowingList(true)}
                    >Return to list</Button>
                </Modal.Footer>
            )}
        </Modal>
    );
}

export default BillModal;