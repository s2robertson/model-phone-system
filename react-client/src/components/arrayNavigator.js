import React, { useState, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';

function ArrayNavigator({ arrayLength = 0, mainTitle, canMove, canAdd, addCallback, addTitle = 'Add', canRemove, removeCallback, removeTitle = 'Remove', children }) {
    const [index, setIndex] = useState(0);
    
    const _canMove = typeof canMove === 'boolean'
        ? canMove
        : canMove instanceof Function
            ? canMove(index)
            : false;
    
    const _canAdd = typeof canAdd === 'boolean'
        ? canAdd
        : canAdd instanceof Function
            ? canAdd(index)
            : false;
    /*console.log('In ArrayNavigator');
    console.log(`canAdd = ${canAdd}`);
    console.log(`_canAdd = ${_canAdd}`);
    console.log(`addCallback = ${addCallback}`);*/

    const _canRemove = typeof canRemove === 'boolean'
        ? canRemove
        : canRemove instanceof Function
            ? canRemove(index)
            : false;

    // if index ever goes out of bounds somehow, correct it
    useEffect(() => {
        if (index > arrayLength || (index === arrayLength && !_canAdd)) {
            setIndex(arrayLength === 0 ? 0 : arrayLength - 1);
        }
        else if (index < 0) {
            setIndex(0);
        }
    }, [index, arrayLength]);

    return (
        <Container className='border rounded my-3'>
            <Form.Row className='d-flex align-items-center my-2'>
                <Col xs='auto'>
                    <Button 
                        type='button'
                        disabled={index <= 0}
                        onClick={() => {
                            if (_canMove && index > 0) {
                                setIndex(index - 1)
                            }
                        }}
                    >   
                        &larr;
                    </Button>
                </Col>
                <Col xs='auto'>
                    <span className='align-middle'>
                        {mainTitle} {arrayLength > 0 && `(${index + 1} of ${arrayLength})`}
                    </span>
                </Col>
                <Col xs='auto'>
                    <Button 
                        type='button'
                        disabled={index >= arrayLength - 1} 
                        onClick={() => {
                            if (_canMove && index < arrayLength -1) {
                                setIndex(index + 1)
                            }
                        }}
                    >
                        &rarr;
                    </Button>
                </Col>
                {addCallback && _canAdd ?
                    <Col xs='auto'>
                        <Button 
                            type='button'
                            onClick={() => {
                                if (_canAdd) {
                                    addCallback();
                                    setIndex(arrayLength);
                                }
                            }}
                        >
                            {addTitle}
                        </Button>
                    </Col>
                    : null
                }
                {_canRemove && removeCallback !== undefined && arrayLength > 0 ? 
                    <Col xs='auto'>
                        <Button 
                            type='button'
                            onClick={() => {
                                if (_canRemove) {
                                    removeCallback(index);
                                    setIndex((prev) => prev === 0 ? 0 : prev - 1);
                                }
                            }}
                        >
                            {removeTitle}
                        </Button>
                    </Col>
                    : null
                }
            </Form.Row>
            {arrayLength > 0 && children(index)}
        </Container>
    );
}

export default ArrayNavigator;