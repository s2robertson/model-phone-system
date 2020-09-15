import React from 'react';
import { render, screen, wait, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/extend-expect';

import CustomerForm from './customerForm';

let mockFetch;
let mockFetchJson;
let saveCallback;
const billingPlans = [
    {
        _id : 'aaa',
        name : 'Billing Plan A'
    },
    {
        _id : 'bbb',
        name : 'Billing Plan B'
    }
];

beforeAll(() => {
    mockFetchJson = jest.fn();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok : true,
        json : mockFetchJson
    });
    saveCallback = jest.fn();
});

beforeEach(() => {
    mockFetch.mockClear();
    mockFetchJson.mockClear();
    mockFetchJson.mockResolvedValue(billingPlans);
    saveCallback.mockClear();
});

test('it renders a blank page', async () => {
    const initialData = {
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

    render(
        <CustomerForm
            customerId='new'
            initialData={initialData}
            saveCallback={saveCallback}
        />
    );
    
    expect(mockFetch).toHaveBeenLastCalledWith('/api/billingPlans');
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/phone accounts/i)).toBeInTheDocument();
    expect(await screen.findByText('Add')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone number/i)).not.toBeInTheDocument();
});

test('adding a phone account', async () => {
    const initialData = {
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

    render(
        <CustomerForm
            customerId='new'
            initialData={initialData}
            saveCallback={saveCallback}
        />
    );
    userEvent.click(await screen.findByText('Add'));
    
    expect(await screen.findByText(/\(1 of 1\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/billing plan/i)).toHaveValue('aaa');
});

test('submitting a new account', async () => {
    const initialData = {
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

    render(
        <CustomerForm
            customerId='new'
            initialData={initialData}
            saveCallback={saveCallback}
        />
    );
    expect(await screen.findByText(/add/i)).toBeInTheDocument();

    userEvent.type(screen.getByLabelText(/first name/i), 'John');
    userEvent.type(screen.getByLabelText(/last name/i), 'Doe');
    userEvent.type(screen.getByLabelText(/street address/i), '123 Example St');
    userEvent.type(screen.getByLabelText(/city/i), 'Cityville');
    userEvent.type(screen.getByLabelText(/postal code/i), 'A1A1A1');
    userEvent.type(screen.getByLabelText(/email/i), 'johndoe@example.com');

    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid email address/i)).not.toBeInTheDocument();
    const saveButton = screen.getByText(/save changes/i);
    expect(saveButton).toBeEnabled();

    const submittedData = {
        firstName : 'John',
        lastName : 'Doe',
        address : {
            streetAddress : '123 Example St',
            city : 'Cityville',
            postalCode : 'A1A1A1'
        },
        email : 'johndoe@example.com',
        phoneAccounts : []
    };
    mockFetchJson.mockResolvedValueOnce(submittedData);

    userEvent.click(saveButton);

    await wait(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/customers', expect.objectContaining({
        method : 'POST',
        headers : {
            'Content-Type': 'application/json'
        },
        body : JSON.stringify(submittedData)
    })));
    expect(saveCallback).toHaveBeenCalled();
});

test('modifying an account', async () => {
    const initialData = {
        firstName : 'John',
        lastName : 'Doe',
        address : {
            streetAddress : '123 Example St',
            city : 'Cityville',
            postalCode : 'A1A1A1'
        },
        email : 'johndoe@example.com',
        phoneAccounts : []
    };

    render(
        <CustomerForm
            customerId='123'
            initialData={initialData}
            saveCallback={saveCallback}
        />
    );
    expect(await screen.findByText(/add/i)).toBeInTheDocument();

    // make some modifications
    const firstNameText = screen.getByLabelText(/first name/i);
    firstNameText.setSelectionRange(0, 4);
    userEvent.type(firstNameText, 'Jack');
    expect(firstNameText).toHaveValue('Jack');
    const emailText = screen.getByLabelText(/email/i);
    fireEvent.change(emailText, { target : { value : 'jdoe@example.com' }});

    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid email address/i)).not.toBeInTheDocument();
    const saveButton = screen.getByText(/save changes/i);
    expect(saveButton).toBeEnabled();

    const submittedData = {
        firstName : 'Jack',
        lastName : 'Doe',
        address : {
            streetAddress : '123 Example St',
            city : 'Cityville',
            postalCode : 'A1A1A1'
        },
        email : 'jdoe@example.com',
        phoneAccounts : []
    };
    mockFetchJson.mockResolvedValueOnce(submittedData);

    userEvent.click(saveButton);

    await wait(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/customers/123', expect.objectContaining({
        method : 'PATCH',
        headers : {
            'Content-Type': 'application/json'
        },
        body : JSON.stringify(submittedData)
    })));
    expect(saveCallback).toHaveBeenCalled();
});

test('invalidating fields should show errors', async () => {
    const initialData = {
        firstName : 'John',
        lastName : 'Doe',
        address : {
            streetAddress : '123 Example St',
            city : 'Cityville',
            postalCode : 'A1A1A1'
        },
        email : 'johndoe@example.com',
        phoneAccounts : []
    };

    render(
        <CustomerForm
            customerId='123'
            initialData={initialData}
            saveCallback={saveCallback}
        />
    );
    expect(await screen.findByText(/add/i)).toBeInTheDocument();

    // delete first name
    fireEvent.change(screen.getByLabelText(/first name/i), { target : { value : '' }});
    expect(await screen.findByText(/required/i)).toBeInTheDocument();

    // set email to johndoe@example.com@example.com
    userEvent.type(screen.getByLabelText(/email/i), '@example.com');
    expect(await screen.findByText(/invalid email address/i)).toBeInTheDocument();
});