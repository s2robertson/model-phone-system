import React, { useState, useEffect, useMemo } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';

import useFetchedData from '../hooks/useFetchedData';

function compileQueryString(query) {
    let result = '';
    for (const key in query) {
        if (query[key]) {
            result += key + "=" + query[key] + "&"
        }
    }
    if (result.length > 0) {
        // remove trailing &
        result = encodeURI(result.slice(0, -1));
    }
    return result;
}

function RecordFinder({ baseUrl, queryParams, mapFunc, chooseRecord, createNewMessage = 'Create new', selectSize = 10, ...props }) {
    const defaultQuery = useMemo(() => {
        const memo = {};
        for (const queryParam of queryParams) {
            memo[queryParam.name] = '';
        }
        return memo;
    }, [queryParams]);
    
    const [queryState, setQueryState] = useState(defaultQuery);
    function queryStateChangeHandler(event) {
        const name = event.target.name;
        const value = event.target.value;
        setQueryState((state) => {
            return {
                ...state,
                [name] : value
            };
        });
    }

    const [selectVal, setSelectVal] = useState('new');
    useEffect(() => {
        chooseRecord(selectVal);
    }, [selectVal, chooseRecord]);

    const {
        data, 
        errorMessage, 
        setUrl
    } = useFetchedData(null, []);
    useEffect(() => {
        setSelectVal('new');
    }, [data])

    return (
        <Form onSubmit={(event) => {
            event.preventDefault();
            const queryString = compileQueryString(queryState);
            if (queryString) {
                setUrl(baseUrl + "?" + queryString);
            }
        }}>
            {queryParams.map(({ name, label }) => (
                <Form.Group key={name} controlId={'rf-' + name}>
                    <Form.Label>{label}</Form.Label>
                    <Form.Control name={name} value={queryState[name]} onChange={queryStateChangeHandler} />
                </Form.Group>
            ))}
            <Button type='submit' block className='mb-3'>Search</Button>
            <Form.Control as='select' custom value={selectVal} onChange={(e) => setSelectVal(e.target.value)} htmlSize={selectSize}>
                <option value='new'>{createNewMessage}</option>
                {data ? data.map(mapFunc) : null}
            </Form.Control>
            {errorMessage ? <span className='text-danger'>{errorMessage}</span> : null}
        </Form>
    );
}

export default RecordFinder;
