const EventEmitter = require('events');

const CALL_REQUEST = 'call_request';
const CALL_NOT_POSSIBLE = 'call_not_possible';
const CALL_CANCELLED = 'call_cancelled';
const CALLEE_RINGING = 'callee_ringing';
const CALL_CONNECTED = 'call_connected';
const CALL_ENDED = 'call_ended';
const TALK = 'talk';

const ERROR = 'error';

class SocketIoRemotePhone extends EventEmitter {
    constructor(socket) {
        super();
        this._socket = socket;
        this.accountId = socket.accountId;
        this.phoneNumber = socket.phoneNumber;
        this.accountSuspended = socket.accountSuspended;
    }

    signalCallRequest(phoneNumber) {
        this._socket.emit(CALL_REQUEST, phoneNumber);
    }

    signalCalleeRinging() {
        this._socket.emit(CALLEE_RINGING);
    }

    signalCallNotPossible(reason) {
        this._socket.emit(CALL_NOT_POSSIBLE, reason);
    }

    signalCallCancelled() {
        this._socket.emit(CALL_CANCELLED);
    }

    signalCallConnected() {
        this._socket.emit(CALL_CONNECTED);
    }

    signalCallEnded() {
        this._socket.emit(CALL_ENDED);
    }

    signalIncomingTalk(msg) {
        this._socket.emit(TALK, msg);
    }

    signalError(reason) {
        this._socket.emit(ERROR, reason);
    }
}

module.exports = SocketIoRemotePhone;