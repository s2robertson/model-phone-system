import React, { useState, useEffect, useCallback } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Navbar from 'react-bootstrap/Navbar';

import { useLoginState, useLoginUpdate } from '../contexts/loginContext';

const defaultFormState = {
    name : '',
    password : '',
    errorMessage : null
};

function LoginForm(props) {
    const [formState, setFormState] = useState(defaultFormState);
    const loginState = useLoginState();
    const setLoginState = useLoginUpdate();
    
    useEffect(() => {
        const getInitialValue = async () => {
            const response = await fetch('/api/login');
            const body = await response.json();

            if (response.ok) {
                setFormState({
                    name : body.name,
                    password : '',
                    errorMessage : null
                });
                setLoginState({
                    loggedIn : true,
                    name : body.name
                });
            }
        }

        getInitialValue();
    }, []);

    const changeHandler = useCallback((event) => {
        const name = event.target.name;
        const value = event.target.value;
        setFormState((prev) => ({
            ...prev,
            [name] : value
        }));
    }, []);

    if (!loginState.loggedIn) {
        return (
            <Form inline
                onSubmit={async (event) => {
                    event.preventDefault();
                    const response = await fetch('/api/login', {
                        method : 'POST',
                        headers : {
                            'Content-Type' : 'application/json'
                        },
                        body : JSON.stringify(formState)
                    });
                    const body = await response.json();
            
                    if (response.ok) {
                        setFormState({
                            name : body.name,
                            password : '',
                            errorMessage : null
                        });
                        setLoginState({
                            loggedIn : true,
                            name : body.name
                        });
                    }
                    else {
                        setFormState((prev) => ({
                            ...prev,
                            errorMessage : body.error
                        }));
                    }
                }}
            >
                <Form.Group controlId='login-name'>
                    <Form.Label srOnly>Name</Form.Label>
                    <Form.Control
                        name='name'
                        placeholder='Name'
                        value={formState.name}
                        onChange={changeHandler}
                        isInvalid={formState.errorMessage}
                        className='mb-2 mb-lg-0 mr-2'
                    />
                    <Form.Control.Feedback type='invalid' tooltip>
                        {formState.errorMessage}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Label htmlFor='login-password' srOnly>Password:</Form.Label>
                <Form.Control
                    id='login-password'
                    name='password'
                    type='password'
                    placeholder='Password'
                    value={formState.password}
                    onChange={changeHandler}
                    className='mb-2 mb-lg-0 mr-2'
                />
                <Button 
                    type='submit'
                    variant='outline-light'
                >
                    Log In
                </Button>
            </Form>
        );
    }
    else {
        return (
            <Form inline
                onSubmit={async (event) => {
                    event.preventDefault();
                    const response = await fetch('/api/logout');
                    if (response.ok) {
                        setLoginState({
                            loggedIn : false,
                            name : ''
                        });
                    }
                }}
            >
                <Navbar.Text>Logged in as {loginState.name}</Navbar.Text>
                <Button
                    type='submit'
                    variant='outline-light'
                    className='ml-2'
                >
                    Log Out
                </Button>
            </Form>
        )
    }
}

export default LoginForm;