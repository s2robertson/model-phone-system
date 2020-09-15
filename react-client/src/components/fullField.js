import React from 'react';
import { useField } from 'formik';

import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

function FullField({ label, children, prepend, ...props }) {
    const [field, meta] = useField(props);

    switch (props.type) {
        case 'radio' :
        case 'checkbox' :
        case 'switch' :
            return (
                <Form.Check
                    label={label}
                    {...field}
                    {...props}
                    feedback={props.type !== 'radio' && meta.error ? meta.error : undefined}
                    isInvalid={meta.touched && meta.error}
                />
            );
        default :
            return (
                <Form.Group controlId={props.id || props.name}>
                    <Form.Label>{label}</Form.Label>
                    <InputGroup>
                        {prepend ? 
                            <InputGroup.Prepend>
                                <InputGroup.Text id={`${props.name}-prepend`}>{prepend}</InputGroup.Text>
                            </InputGroup.Prepend>
                            : null}
                        <Form.Control
                            as={props.type === 'select' ? 'select' : 'input'}
                            {...field}
                            {...props}
                            isInvalid={meta.touched && meta.error}
                            aria-describedby={prepend ? `${props.name}-prepend` : null}
                        >
                            {children}
                        </Form.Control>
                        {meta.error ? (
                            <Form.Control.Feedback type='invalid'>
                                {meta.error}
                            </Form.Control.Feedback>
                        ) : null}
                    </InputGroup>
                </Form.Group>
            );
    }
}

export default FullField;
