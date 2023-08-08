const AwaitEventEmitter = require('../../helpers/awaitEventEmitter');

class MockRemotePhone extends AwaitEventEmitter {
    static instances = [];
    static mockClear() {
        this.instances = [];
    }

    constructor(socket) {
        super();
        this._socket = socket;
        this.accountId = socket.accountId;
        this.phoneNumber = socket.phoneNumber;
        this.accountSuspended = socket.accountSuspended;
        MockRemotePhone.instances.push(this);
    }

    signalCallRequest = jest.fn();

    signalCalleeRinging = jest.fn();

    signalCallNotPossible = jest.fn();

    signalCallCancelled = jest.fn();

    signalCallConnected = jest.fn();

    signalCallEnded = jest.fn();

    signalIncomingTalk = jest.fn();

    signalError = jest.fn();

    mockClear() {
        this.signalCallRequest.mockClear();
        this.signalCalleeRinging.mockClear();
        this.signalCallNotPossible.mockClear();
        this.signalCallCancelled.mockClear();
        this.signalCallConnected.mockClear();
        this.signalCallEnded.mockClear();
        this.signalIncomingTalk.mockClear();
        this.signalError.mockClear();
    }
}

module.exports = MockRemotePhone;