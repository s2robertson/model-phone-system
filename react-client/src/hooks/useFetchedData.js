import { useState, useEffect } from 'react';

import { useLoginState } from '../contexts/loginContext';

function useFetchedData(initialUrl, initialData) {
    const [url, setUrl] = useState(initialUrl);
    const [data, setData] = useState(initialData);
    const [errorMessage, setErrorMessage] = useState(null);

    const loginState = useLoginState();
    const loggedIn = loginState ? loginState.loggedIn : false;

    // refresh the fetched data whenever url is updated
    useEffect(() => {
        const doFetch = async () => {
            try {
                const result = await fetch(url);
                const resultData = await result.json();

                if (result.ok) {
                    setData(resultData);
                    setErrorMessage(null);
                }
                else  {
                    throw new Error(resultData.error || "An error occurred while fetching data.");
                }
            }
            catch (err) {
                setErrorMessage(err.message);
            }
        };

        if (url) {
            doFetch();
        }
        else {
            setErrorMessage(null);
        }
    }, [url, loggedIn]);

    return [data, errorMessage, setUrl, setData];
}

export default useFetchedData;
