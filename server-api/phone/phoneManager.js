const registry = require('./registry/');

const PhoneAccount = require('../models/phoneAccount');
const BillingPlan = require('../models/billingPlan');
const Call = require('../models/call');

const processCall = require('../billing/processCall');

const PhoneStates = {
    INVALID : 'invalid',
    NOT_IN_CALL : 'not_in_call',
    CALL_INIT_OUTGOING : 'call_init_outgoing',
    CALL_INIT_INCOMING : 'call_init_incoming',
    CALL_INIT_CREATING_DOC : 'call_init_creating_doc',
    CALL_ACTIVE : 'call_active'
}
Object.freeze(PhoneStates);

const CALL_NOT_POSSIBLE_REASONS = {
    INACTIVE: 'not_active',
    ALREADY_IN_CALL: 'already_in_call',
    DIALED_SELF: 'dialed_self',
    NO_RECIPIENT: 'no_recipient',
    BUSY: 'busy',
    ERROR: 'error'
}
Object.freeze(CALL_NOT_POSSIBLE_REASONS);

const UPDATE_PHONE_NUMBER = 'update_phone_number';
const SUSPEND_PHONE = 'suspend_phone';
const UNSUSPEND_PHONE = 'unsuspend_phone';

class Phone {
    constructor(remotePhone) {
        this.remotePhone = remotePhone;
        this.phoneState = remotePhone.accountSuspended ? PhoneStates.INVALID : PhoneStates.NOT_IN_CALL;
        this.phoneNumber = remotePhone.phoneNumber;
        this.accountId = remotePhone.accountId;
        this.callPartner = null;
        this.callPartnerConfirmed = false;
        this.billId = null;
        this.billingPlanId = null;
        this.callDoc = null;
        // this.callCloseTimer = null;
    }

    get isValid() {
        return this.phoneState !== PhoneStates.INVALID;
    }

    get isOnCall() {
        return this.phoneState === PhoneStates.CALL_INIT_INCOMING ||
            this.phoneState === PhoneStates.CALL_INIT_OUTGOING ||
            this.phoneState === PhoneStates.CALL_INIT_CREATING_DOC ||
            this.phoneState ===  PhoneStates.CALL_ACTIVE;
    }

    async onDisconnect() {
        switch (this.phoneState) {
            case PhoneStates.CALL_INIT_OUTGOING :
                this.callPartner.onCallCancelled(this.phoneNumber);
                break;
            case PhoneStates.CALL_INIT_INCOMING :
                this.callPartner.onCallRefusedPartner(this.phoneNumber, 'callee_disconnected');
                break;
            // case PhoneStates.CALL_INIT_CREATING_DOC:
                // onCallAccepted will handle this case
            case PhoneStates.CALL_ACTIVE :
                await this.closeCall();
                break;
        }
        
        this.phoneState = PhoneStates.INVALID;
        registry.delete(this.phoneNumber);
    }

    async onMakeCall(phoneNumber) {
        //console.log(`In make_call (${this.phoneNumber})`);
        try {
            if (this.phoneState === PhoneStates.INVALID) {
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.INACTIVE);
                //console.log('make_call failed (caller suspended)');
                return;
            }
            else if (this.phoneState !== PhoneStates.NOT_IN_CALL) {
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.ALREADY_IN_CALL);
                //console.log('make_call failed (caller already in call)');
                return;
            }
            else if (phoneNumber === this.phoneNumber) {
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.DIALED_SELF);
                //console.log('make_call failed (dialed self)');
                return;
            }
    
            const otherPhone = await registry.get(phoneNumber);
            
            if (!otherPhone || !otherPhone.isValid) {
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.NO_RECIPIENT);
                //console.log('make_call failed no() recipient found)');
                return;
            }
            else if (otherPhone.isOnCall) {
                // convenience check before querying the database for phone account status
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.BUSY);
                //console.log('make_call failed (recipient busy)');
                return;
            }
            
            const phoneAccounts = await PhoneAccount.find({ 
                _id : { $in : [this.accountId, otherPhone.accountId] }
            }).exec();

            // validate the query results
            if (!phoneAccounts || phoneAccounts.length !== 2) {
                //console.log(`phoneAccounts.length = ${phoneAccounts ? phoneAccounts.length : 0}`);
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.ERROR);
                return;
            }
            let callerIndex = -1, calleeIndex = -1;
            for (let i = 0; i < phoneAccounts.length; i++) {
                if (phoneAccounts[i]._id.equals(this.accountId)) {
                    callerIndex = i;
                }
                else if (phoneAccounts[i]._id.equals(otherPhone.accountId)) {
                    calleeIndex = i;
                }
            }
            if (callerIndex === -1 || calleeIndex === -1) {
                //console.log(`Could not identify phone accounts: callerIndex = ${callerIndex}, calleeIndex = ${calleeIndex}`);
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.ERROR);
                return;
            }

            /* Verify that both phone accounts are active and not suspended.  The INVALID
             * check is in case the phone disconnected while looking up the db record. */
            if (this.phoneState === PhoneStates.INVALID) {
                return;
            }
            if (!phoneAccounts[callerIndex].isActive || phoneAccounts[callerIndex].isSuspended) {
                //console.log('make_call failed because caller is retired or suspended');
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.ERROR);
                return;
            } else if (!phoneAccounts[calleeIndex].isActive || phoneAccounts[calleeIndex].isSuspended) {
                //console.log('make_call failed because callee is retired or suspended');
                this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.NO_RECIPIENT);
                return;
            }
            
            this.phoneState = PhoneStates.CALL_INIT_OUTGOING;
            this.callPartner = otherPhone;
            this.billId = phoneAccounts[callerIndex].currentBill;
            this.billingPlanId = phoneAccounts[callerIndex].billingPlan;
            this.callPartner.onIncomingCall(this.phoneNumber);
            //console.log('make_call passed on call request');
        }
        catch (err) {
            console.log(`make_call failed due to an error: ${err}`);
            this.remotePhone.signalCallNotPossible(CALL_NOT_POSSIBLE_REASONS.ERROR);
            this.resetCallProperties();
        }
    }

    onIncomingCall(phoneNumber) {
        this.remotePhone.signalCallRequest(phoneNumber);
    }

    async onCallAcknowledgedSelf(phoneNumber) {
        const otherPhone = await registry.get(phoneNumber);

        if (this.phoneState === PhoneStates.INVALID) {
            // the phone got suspended
            this.remotePhone.signalCallCancelled();
            otherPhone.onCallRefusedPartner(phoneNumber, CALL_NOT_POSSIBLE_REASONS.NO_RECIPIENT);
            return;

        }
        else if (this.phoneState !== PhoneStates.NOT_IN_CALL) {
            // this shouldn't happen
            if (this.callPartner && otherPhone.key !== this.callPartner.key) {
                otherPhone.onCallRefusedPartner(phoneNumber, CALL_NOT_POSSIBLE_REASONS.BUSY);
            }
            return;
        }

        this.phoneState = PhoneStates.CALL_INIT_INCOMING;
        this.callPartner = otherPhone;
        this.callPartner.onCallAcknowledgedPartner();
    }

    onCallAcknowledgedPartner() {
        this.remotePhone.signalCalleeRinging();
    }

    onCallAccepted() {
        if (this.phoneState === PhoneStates.CALL_INIT_INCOMING) {
            this.onCallAcceptedIncoming();
        }
        else if (this.phoneState === PhoneStates.CALL_INIT_OUTGOING && this.callPartnerConfirmed) {
            return this.onCallAcceptedOutgoing();
        }
        else {
            this.remotePhone.signalError('invalid_call_accepted');
        }
    }

    onCallAcceptedIncoming() {
        this.phoneState = PhoneStates.CALL_ACTIVE;
        this.callPartner.onPartnerConnected(this.phoneNumber);
    }

    async onCallAcceptedOutgoing() {
        try {
            // Persist to DB
            this.phoneState = PhoneStates.CALL_INIT_CREATING_DOC;
            const callDoc = new Call({
                callerBill : this.billId,
                calleeNumber : this.callPartner.phoneNumber
            });
            //console.log('Saving from onCallAccepted');
            await callDoc.save();

            if (this.phoneState !== PhoneStates.CALL_INIT_CREATING_DOC) {
                // someone either disconnected, or was suspended
                if (this.callPartner) {
                    // callPartner can be empty if the callee hung up immediately
                    this.callPartner.onCallCancelled(this.phoneNumber);
                }
                this.resetCallProperties();
                await callDoc.remove();
                return;
            }
            
            this.phoneState = PhoneStates.CALL_ACTIVE;
            this.callDoc = callDoc;
            this.callPartner.onPartnerConnected(this.phoneNumber);
            
            await registry.beginCall(this.phoneNumber, this.callPartner.phoneNumber, this.callDoc.id, this.billingPlanId);
        }
        catch (err) {
            if (this.phoneState === PhoneStates.CALL_ACTIVE) {
                //console.log('Calling closeCall from onCallAccepted (error case)');
                await this.closeCall();
            }
            this.resetCallProperties();
        }
    }

    async onCallRefusedSelf(phoneNumber, reason) {
        let otherPhone;
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber) {
            otherPhone = this.callPartner;
            this.resetCallProperties();
        }
        else {
            otherPhone = await registry.get(phoneNumber);
        }
        otherPhone.onCallRefusedPartner(this.phoneNumber, reason);
    }

    onCallRefusedPartner(phoneNumber, reason) {
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber) {
            this.resetCallProperties();
            this.remotePhone.signalCallNotPossible(reason);
        }
    }

    onCallCancelled(phoneNumber) {
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber) {
            this.resetCallProperties();
            this.remotePhone.signalCallCancelled();
        }
    }

    onPartnerConnected(phoneNumber) {
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber) {
            this.callPartnerConfirmed = true;
            this.remotePhone.signalCallConnected();
        }
    }

    async onHangUp() {
        switch (this.phoneState) {
            case PhoneStates.CALL_ACTIVE :
                await this.closeCall();
                this.resetCallProperties();
                /*if (!this.callCloseTimer) {
                }*/
                break;
            case PhoneStates.CALL_INIT_CREATING_DOC :
                // the onCallAccepted handler will do the rest
                this.resetCallProperties(false);
                break;
            case PhoneStates.CALL_INIT_OUTGOING :
                this.callPartner.onCallCancelled(this.phoneNumber);
                this.resetCallProperties();
                break;
            case PhoneStates.CALL_INIT_INCOMING :
                // this shouldn't happen, but just in case...
                this.callPartner.onCallRefusedPartner(this.phoneNumber, CALL_NOT_POSSIBLE_REASONS.ERROR);
                this.resetCallProperties();
                break;
            default :
                // redis properties shouldn't be set, so no need to clear them
                return;
        }
    }

    async closeCall(notifyPartner = true, endDate = new Date()) {
        //console.log('In closeCall');
        //console.log(`this.phoneNumber = ${this.phoneNumber})`);
        
        // callDoc should initially only be set on the caller
        if (this.callDoc) {
            try {
                if (notifyPartner) {
                    this.callPartner.onCallEndedRemotely(this.phoneNumber);
                }
                // Process any charges on the call, then persist to the DB
                this.callDoc.endDate = endDate;
                const bpId = this.billingPlanId;
                const billingPlan = await BillingPlan.findById(bpId).exec();
                processCall(this.callDoc, billingPlan);
                await this.callDoc.save();
                await registry.endCall(this.phoneNumber, this.callPartner.phoneNumber);
            }
            catch (err) {
                console.log(err);
            }
        }
        else {
            /* If the callee hung up, ask the caller's server to process the call.  However, if no
             * acknowledgement is received, look up the call details and process the call recursively. */
            /*this.callCloseTimer = setTimeout(async () => {
                this.callCloseTimer = null;
                try {
                    const external = await redisClient.hgetall(this.key);
                    this.callDoc = await Call.findById(external[CALL_ID]).exec();
                    this.billingPlanId = external[CALL_BP_ID];
                    await this.closeCall(false, endDate);
                    this.resetCallProperties();
                }
                catch (err) {
                    // ?
                }
            }, 5000); // the timeout value could be changed 
            */
            await this.callPartner.onCallEndedRemotely(this.phoneNumber, true);
        }
    }

    async onCallEndedRemotely(phoneNumber, /*ack = false*/) {
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber) {
            this.remotePhone.signalCallEnded();
            if (this.callDoc /*ack*/) {
                // the remote server wants this one to process the call
                await this.closeCall(false);
                this.callPartner.onCloseCallAcknowledgement(this.phoneNumber);
            }
            this.resetCallProperties();
        }
    }

    onCloseCallAcknowledgement(phoneNumber) {
        if (this.callPartner && this.callPartner.phoneNumber === phoneNumber /*&& this.callCloseTimer*/) {
            // clearTimeout(this.callCloseTimer);
            // this.callCloseTimer = null;
            this.resetCallProperties();
        }
    }

    resetCallProperties(resetPartner = true) {
        this.phoneState = this.phoneState === PhoneStates.INVALID ? PhoneStates.INVALID : PhoneStates.NOT_IN_CALL;
        if (resetPartner) {
            this.callPartner = null;
        }
        this.callPartnerConfirmed = false;
        this.billId = null;
        this.billingPlanId = null;
        this.callDoc = null;
    }

    onTalkSelf(msg) {
        // console.log(`talk event from ${socket.phoneNumber} to ${socket.callPartner.phoneNumber}.  msg = ${msg}`)
        if (this.phoneState === PhoneStates.CALL_ACTIVE && this.callPartner) {
            this.callPartner.onTalkPartner(msg);
            // console.log('talk event sent')
        }
    }

    onTalkPartner(msg) {
        if (this.phoneState === PhoneStates.CALL_ACTIVE) {
            this.remotePhone.signalIncomingTalk(msg);
        }
    }
}

module.exports.addPhone = function(remotePhone) {
    const phone = new Phone(remotePhone);
    remotePhone.on('disconnect', () => phone.onDisconnect());
    remotePhone.on('make_call', (phoneNumber) => phone.onMakeCall(phoneNumber));
    remotePhone.on('call_acknowledged', (phoneNumber) => phone.onCallAcknowledgedSelf(phoneNumber));
    remotePhone.on('call_accepted', () => phone.onCallAccepted());
    remotePhone.on('hang_up', () => phone.onHangUp());
    remotePhone.on('call_refused', (phoneNumber, reason) => phone.onCallRefusedSelf(phoneNumber, reason));
    remotePhone.on('talk', (msg) => phone.onTalkSelf(msg));

    registry.set(phone.phoneNumber, phone);
}

module.exports.updatePhoneNumber = async function(oldVal, newVal) {
    const phone = await registry.get(oldVal)
    await registry.delete(oldVal);
    phone.phoneNumber = newVal;
    await registry.set(newVal, phone);
    // const oldKey = getKey(oldVal);
    // redisClient.publish(oldKey, JSON.stringify([UPDATE_PHONE_NUMBER, newVal]));
}

/*remoteEvents.on(UPDATE_PHONE_NUMBER, async (phone, newPhoneNumber) => {
    const newKey = getKey(newPhoneNumber);
    localRegistry.delete(phone.key);
    await phone.clearRemote();

    phone.phoneNumber = newPhoneNumber;
    phone.key = newKey;
    localRegistry.set(newKey, phone);
    await phone.initRemote();
});*/

module.exports.suspendPhone = async function(phoneNumber) {
    const phone = await registry.get(phoneNumber);
    const prevState = phone.phoneState;
    phone.phoneState = PhoneStates.INVALID;
    if (!(prevState === PhoneStates.INVALID || prevState === PhoneStates.NOT_IN_CALL)) {
        await phone.onHangUp();
    }
    await registry.changeValidState(phoneNumber, false);
    // redisClient.publish(getKey(phoneNumber), JSON.stringify([SUSPEND_PHONE]));    
}

/*remoteEvents.on(SUSPEND_PHONE, async (phone) => {
    const prevState = phone.phoneState;
    phone.phoneState = PhoneStates.INVALID;
    if (!(prevState === PhoneStates.INVALID || prevState === PhoneStates.NOT_IN_CALL)) {
        await phone.onHangUp();
    }
    await redisClient.hset(phone.key, IS_VALID, false);
});*/

module.exports.unsuspendPhone = async function(phoneNumber) {
    const phone = await registry.get(phoneNumber);
    phone.phoneState = PhoneStates.NOT_IN_CALL;
    await registry.changeValidState(phoneNumber, true);
    // redisClient.publish(getKey(phoneNumber), JSON.stringify([UNSUSPEND_PHONE]));
}

/*remoteEvents.on(UNSUSPEND_PHONE, (phone) => {
    phone.phoneState = PhoneStates.NOT_IN_CALL;
    redisClient.hset(phone.key, IS_VALID, true);
})*/