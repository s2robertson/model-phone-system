import React from 'react';

import {
    BrowserRouter as Router,
    Switch,
    Route,
    Link
} from 'react-router-dom';

import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';

import CustomerPage from './pages/customerPage';
import BillingPlanPage from './pages/billingPlanPage';
import LoginForm from './forms/loginForm';

import { LoginContextProvider } from './contexts/loginContext';

function App(props) {
    return (
        <LoginContextProvider>
            <Router>
                <Container>
                    <Navbar bg='primary' variant='dark' expand='md' className='mb-3'>
                        <Navbar.Brand>VoIP Telephony</Navbar.Brand>
                        <Navbar.Toggle aria-controls='voip-system-navbar' />
                        <Navbar.Collapse id='voip-system-navbar'>
                            <Nav>
                                <Nav.Link to='/customers' as={Link}>Customers</Nav.Link>
                            </Nav>
                            <Nav className='mr-auto'>
                                <Nav.Link to='/billingPlans' as={Link}>Billing Plans</Nav.Link>
                            </Nav>
                            <LoginForm />
                        </Navbar.Collapse>
                    </Navbar>
                    <Switch>
                        <Route path='/customers'>
                            <CustomerPage />
                        </Route>
                        <Route path='/billingPlans'>
                            <BillingPlanPage />
                        </Route>
                    </Switch>
                </Container>
            </Router>
        </LoginContextProvider>
    );
}

export default App;
