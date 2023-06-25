const EventEmitter = require('events');
const AwaitEventEmitter = require('../helpers/awaitEventEmitter');
const io = require('socket.io');

const PhoneAccount = require('../models/phoneAccount');
const phoneManager = require('./phoneManager');

const CALL_REQUEST = 'call_request';
const CALL_NOT_POSSIBLE = 'call_not_possible';
const CALL_CANCELLED = 'call_cancelled';
const CALLEE_RINGING = 'callee_ringing';

const ERROR = 'error';

// AwaitEventEmitter is only for migration, and needs to change to EventEmitter
class RemotePhone extends AwaitEventEmitter {
    constructor(socket) {
        super();
        this._socket = socket;
    }

    signalCallRequest(phoneNumber) {
        this._socket.emit(CALL_REQUEST, phoneNumber);
    }

    signalCallNotPossible(reason) {
        this._socket.emit(CALL_NOT_POSSIBLE, reason);
    }

    signalCallCancelled() {
        this._socket.emit(CALL_CANCELLED);
    }

    signalCalleeRinging() {
        this._socket.emit(CALLEE_RINGING);
    }

    signalError(reason) {
        this._socket.emit(ERROR, reason);
    }
}

function buildSocketIoPhoneAdapter(server) {
    const adapter = io(server, { serveClient: false });

    adapter.use(async (socket, next) => {
        const phoneNumber = socket.handshake.auth.phoneNumber;
        if (!phoneNumber) {
            return next(new Error('No phone number provided'));
        }

        const phoneAccount = await PhoneAccount.findOne({
            phoneNumber: phoneNumber,
            isActive: true
        }).exec();
        if (!phoneAccount) {
            return next(new Error('Invalid phone number'));
        }

        socket.accountId = phoneAccount._id;
        socket.phoneNumber = phoneNumber;
        socket.accountSuspended = phoneAccount.isSuspended;
        next();
    });

    adapter.on('connection', (socket) => {
        //console.log('phone connecting:');
        const phone = new RemotePhone(socket);
        //console.log(`   phone number: ${phone.phoneNumber}`)    ;
        
        // 'disconnect' event is special, and not handled by onAny
        // Is there a way to make sure this gets garbage collected?
        socket.on('disconnect', () => phone.emit('disconnect'));
        /*socket.on('make_call', (phoneNumber) => phone.onMakeCall(phoneNumber));
        socket.on('call_acknowledged', (phoneNumber) => phone.onCallAcknowledged(phoneNumber));
        socket.on('call_accepted', () => phone.onCallAccepted());
        socket.on('hang_up', () => phone.onHangUp());
        socket.on('call_refused', (phoneNumber, reason) => phone.onCallRefusedSelf(phoneNumber, reason));
        socket.on('talk', (msg) => phone.onTalk(msg));*/
        socket.onAny((event, ...args) => phone.emit(event, ...args));
        phoneManager.addPhone(phone);

        // register remote phone with phone manager
        socket.emit('registered', socket.phoneNumber);
    });
}

module.exports = buildSocketIoPhoneAdapter;