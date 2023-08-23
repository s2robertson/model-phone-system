const localRegistry = new Map();
const getKey = phoneNumber => `phone:${phoneNumber}`;

const EventEmitter = require('events');
const remoteEvents = new EventEmitter();

const Redis = require('ioredis');
// Potential improvement: use a separate redis instance instead of just namespacing
const redisClient = new Redis(process.env.REDIS_CONN, { db: 1 });
const subClient = redisClient.duplicate();

subClient.on('message', (channel, msg) => {
    const phone = localRegistry.get(channel);
    if (phone) {
        const [event, ...eventArgs] = JSON.parse(msg);
        remoteEvents.emit(event, phone, ...eventArgs);
    }
});

const ACCOUNT_ID = 'accountId';
const IS_VALID = 'isValid';
const CALL_ID = 'callId';
const CALL_BP_ID = 'callBpId';

const CALL_REQUEST = 'call_request';
const CALL_REFUSED = 'call_refused';
const CALLEE_RINGING = 'callee_ringing';
const CALL_CANCELLED = 'call_cancelled';
const CALL_CONNECTED = 'call_connected';
const CALL_ENDED = 'call_ended';
const CLOSE_CALL_ACK = 'close_call_ack';
const TALK = 'talk';

function parseBoolean(bool) {
    return !(bool == false || bool === 'false');
}

class RemotePhone {
    constructor(phoneNumber, remotePhoneData) {
        this.phoneNumber = phoneNumber;
        this.key = getKey(this.phoneNumber);
        this.accountId = remotePhoneData[ACCOUNT_ID];
        this.isValid = parseBoolean(remotePhoneData[IS_VALID]);
        this.isOnCall = !!remotePhoneData[CALL_ID];
    }

    onIncomingCall(phoneNumber) {
        redisClient.publish(this.key, JSON.stringify([CALL_REQUEST, phoneNumber]));
    }

    onCallAcknowledgedPartner() {
        redisClient.publish(this.key, JSON.stringify([CALLEE_RINGING]));
    }

    onCallRefusedPartner(phoneNumber, reason) {
        redisClient.publish(this.key, JSON.stringify([CALL_REFUSED, phoneNumber, reason]));
    }

    onPartnerConnected(phoneNumber) {
        redisClient.publish(this.key, JSON.stringify([CALL_CONNECTED, phoneNumber]));
    }

    onCallCancelled(phoneNumber) {
        redisClient.publish(this.key, JSON.stringify([CALL_CANCELLED, phoneNumber]));
    }

    onCallEndedRemotely(phoneNumber, ack = false) {
        redisClient.publish(this.key, JSON.stringify([CALL_ENDED, phoneNumber, ack]));
    }

    onCloseCallAcknowledgement(phoneNumber) {
        redisClient.publish(this.key, JSON.stringify([CLOSE_CALL_ACK, phoneNumber]));
    }

    onTalkPartner(msg) {
        redisClient.publish(this.key, JSON.stringify([TALK, msg]));
    }
}

remoteEvents.on(CALL_REQUEST, (phone, phoneNumber) => {
    phone.onIncomingCall(phoneNumber);
});

remoteEvents.on(CALLEE_RINGING, (phone) => {
    phone.onCallAcknowledgedPartner();
})

remoteEvents.on(CALL_REFUSED, (phone, phoneNumber, reason) => {
    phone.onCallRefusedPartner(phoneNumber, reason);
});

remoteEvents.on(CALL_CANCELLED, (phone, phoneNumber) => {
    phone.onCallCancelled(phoneNumber);
});

remoteEvents.on(CALL_CONNECTED, (phone, phoneNumber) => {
    phone.onPartnerConnected(phoneNumber);
});

remoteEvents.on(CALL_ENDED, (phone, phoneNumber, ack) => {
    phone.onCallEndedRemotely(phoneNumber, ack);
});

remoteEvents.on(CLOSE_CALL_ACK, (phone, phoneNumber) => {
    phone.onCloseCallAcknowledgement(phoneNumber);
});

remoteEvents.on(TALK, (phone, msg) => {
    phone.onTalkPartner(msg);
})

module.exports.get = async function(phoneNumber) {
    const key = getKey(phoneNumber);
    let phone = localRegistry.get(key);
    if (!phone) {
        const phoneData = await redisClient.hgetall(key);
        // if the phoneNumber is invalid/not connected, phoneData will be {}
        if (phoneData[ACCOUNT_ID]) {
            phone = new RemotePhone(phoneNumber, phoneData);
        }
    }
    return phone;
}

module.exports.set = function(phoneNumber, phone) {
    const key = getKey(phoneNumber);
    localRegistry.set(key, phone);
    return initRemote(key, phone);
}

function initRemote(key, phone) {
    const hsetArgs = [key, 
        ACCOUNT_ID, phone.accountId, 
        IS_VALID, phone.isValid
    ];
    if (phone.callDoc) {
        hsetArgs.push(CALL_ID, phone.callDoc.id);
    }
    if (phone.billingPlanId) {
        hsetArgs.push(CALL_BP_ID, phone.billingPlanId);
    }
    return Promise.all([
        redisClient.hset(...hsetArgs),
        subClient.subscribe(key)
    ]);
}

module.exports.beginCall = function(primaryPhoneNumber, secondaryPhoneNumber, callId, billingPlanId) {
    const primaryKey = getKey(primaryPhoneNumber);
    const secondaryKey = getKey(secondaryPhoneNumber);
    return redisClient.multi()
        .hset(primaryKey, CALL_ID, callId, CALL_BP_ID, billingPlanId)
        .hset(secondaryKey, CALL_ID, callId, CALL_BP_ID, billingPlanId)
        .exec();
}

module.exports.endCall = function(primaryPhoneNumber, secondaryPhoneNumber) {
    const primaryKey = getKey(primaryPhoneNumber);
    const secondaryKey = getKey(secondaryPhoneNumber);
    return redisClient.multi()
        .hdel(primaryKey, CALL_ID, CALL_BP_ID)
        .hdel(secondaryKey, CALL_ID, CALL_BP_ID)
        .exec();
}

module.exports.changeValidState = function(phoneNumber, isValid) {
    const key = getKey(phoneNumber);
    return redisClient.hset(key, IS_VALID, isValid);
}

module.exports.delete = function(phoneNumber) {
    const key = getKey(phoneNumber);
    localRegistry.delete(key);
    return clearRemote(key);
}

function clearRemote(key) {
    return Promise.all([
        redisClient.del(key),
        subClient.unsubscribe(key)
    ]);
}