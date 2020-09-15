import React, { useState, useContext } from 'react';

const LoginStateContext = React.createContext();
const LoginUpdateContext = React.createContext();

function LoginContextProvider({ children }) {
    const [loginState, setLoginState] = useState({
        loggedIn : false,
        username : null
    });

    return (
        <LoginStateContext.Provider value={loginState}>
            <LoginUpdateContext.Provider value={setLoginState}>
                {children}
            </LoginUpdateContext.Provider>
        </LoginStateContext.Provider>
    );
}

function useLoginState() {
    const contextVal = useContext(LoginStateContext);
    /*if (contextVal === undefined) {
        throw new Error('useLoginState must be used within a LoginContextProvider');
    }*/
    return contextVal;
}

function useLoginUpdate() {
    const contextVal = useContext(LoginUpdateContext);
    if (contextVal === undefined) {
        throw new Error('useLoginUpdate must be used within a LoginContextProvider');
    }
    return contextVal;
}

export { LoginContextProvider, useLoginState, useLoginUpdate };