let io;
//const redis = require('redis');
// Potential improvement: use a separate redis instance instead of just namespacing
//const redisClient = redis.createClient(process.env.REDIS_CONN, { db: 1 });

const PhoneAccount = require('../models/phoneAccount');
const BillingPlan = require('../models/billingPlan');
const Call = require('../models/call');

const processCall = require('../billing/processCall');

const registry = new Map()

const PhoneStates = {
    INVALID : 'invalid',
    NOT_IN_CALL : 'not_in_call',
    CALL_INIT_OUTGOING : 'call_init_outgoing',
    CALL_INIT_INCOMING : 'call_init_incoming',
    CALL_INIT_INCOMING_ACKNOWLEDGED : 'call_init_incoming_acknowledged',
    CALL_INIT_CREATING_DOC : 'call_init_creating_doc',
    CALL_ACTIVE : 'call_active'
}
Object.freeze(PhoneStates);

const CALL_NOT_POSSIBLE = 'call_not_possible';
const BUSY = 'busy';
const CALL_CANCELLED = 'call_cancelled';
const CALL_ENDED = 'call_ended';

class Phone {
    constructor(socket) {
        this.socket = socket;
        this.phoneState = PhoneStates.INVALID;
        this.phoneNumber = null;
        this.accountId = null;
        this.callPartner = null;
        this.billId = null;
        this.billingPlanId = null;
        this.callDoc = null;
    }

    async onDisconnect() {
        if (this.phoneNumber) {
            registry.delete(this.phoneNumber);
        }
        
        switch (this.phoneState) {
            case PhoneStates.CALL_INIT_OUTGOING :
                this.callPartner.socket.emit(CALL_CANCELLED);
                this.resetCallProperties();
                break;
            case PhoneStates.CALL_INIT_INCOMING :
            case PhoneStates.CALL_INIT_INCOMING_ACKNOWLEDGED :
                this.callPartner.socket.emit(CALL_NOT_POSSIBLE, 'callee_disconnected');
                this.resetCallProperties();
                break;
            case PhoneStates.CALL_INIT_CREATING_DOC:
            case PhoneStates.CALL_ACTIVE :
                await this.closeCall();
                break;
            default :
        }
        //this.phoneState = PhoneStates.INVALID;
    }

    async onRegister(phoneAccountId) {
        try {
            if (!phoneAccountId) {
                this.socket.emit('registration_failed', 'invalid_account');
                return;
            }
            
            const phoneAccount = await PhoneAccount.findById(phoneAccountId).exec();
            //console.log(`phoneAccount = ${phoneAccount}`);
            if (!phoneAccount) {
                // the reason could be elaborated on, e.g. to play feedback on the user's end
                this.socket.emit('registration_failed', 'invalid_account');
                return;
            }
    
            const registerVal = registry.get(phoneAccount.phoneNumber);
            if (registerVal && registerVal !== this) {
                this.socket.emit('registration_failed', 'phone_number_in_use');
                return;
            }
    
            // Authorization code could go here
    
            if (phoneAccount.isActive && !phoneAccount.isSuspended) {
                this.phoneState = PhoneStates.NOT_IN_CALL;
            }
            this.accountId = phoneAccount._id;
            this.phoneNumber = phoneAccount.phoneNumber;
            registry.set(this.phoneNumber, this);
            this.socket.emit('registered', this.phoneNumber);
        }
        catch (err) {
            //console.log(`onRegister failed! ${err}`);
            this.socket.emit('registration_failed', 'error');
        }
    }

    async onMakeCall(phoneNumber) {
        //console.log('In make_call');
        try {
            if (this.phoneState === PhoneStates.INVALID) {
                if (!this.accountId) {
                    this.socket.emit(CALL_NOT_POSSIBLE, 'not_registered');
                }
                else {
                    this.socket.emit(CALL_NOT_POSSIBLE, 'not_active');
                }
                //console.log('make_call failed due to caller not being registered')
                return;
            }
            else if (this.phoneState === PhoneStates.CALL_INIT_INCOMING) {
                /* This is a race condition where another phone is trying to call 
                 * this one at the same time as this one makes a call. */
                this.callPartner.socket.emit(CALL_NOT_POSSIBLE, BUSY);
                this.resetCallProperties();
            }
            else if (this.phoneState !== PhoneStates.NOT_IN_CALL) {
                this.socket.emit(CALL_NOT_POSSIBLE, 'already_in_call');
                return;
            }
    
            let otherPhone = registry.get(phoneNumber);
            if (!otherPhone || otherPhone.phoneState === PhoneStates.INVALID) {
                this.socket.emit(CALL_NOT_POSSIBLE, 'no_recipient');
                // console.log('make_call failed: no recipient found');
                return;
            }
            else if (otherPhone.phoneState !== PhoneStates.NOT_IN_CALL) {
                // convenience check before querying the database for phone account status
                this.socket.emit(CALL_NOT_POSSIBLE, BUSY);
                // console.log('make_call failed: recipient busy');
                return;
            }
            else if (otherPhone === this) {
                this.socket.emit(CALL_NOT_POSSIBLE, 'dialed_self');
                // console.log('make_call failed: dialed self');
                return;
            }

            /* Set the phone state here in case another phone tries calling this one
            * while the database query is ongoing */
            this.phoneState = PhoneStates.CALL_INIT_OUTGOING;

            const phoneAccounts = await PhoneAccount.find({ 
                _id : { $in : [this.accountId, otherPhone.accountId]}
            }).exec();

            // validate the query results
            if (!phoneAccounts || phoneAccounts.length !== 2) {
                //console.log(`phoneAccounts.length = ${phoneAccounts ? phoneAccounts.length : 0}`);
                this.socket.emit(CALL_NOT_POSSIBLE, 'error');
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
                socket.emit(CALL_NOT_POSSIBLE, 'error');
                return;
            }

            /* Verify that both phone accounts are active and not suspended.  The INVALID
             * check is in case the phone disconnected while looking up the db record. */
            if (this.phoneState === PhoneStates.INVALID) {
                return;
            }
            if (!phoneAccounts[callerIndex].isActive || phoneAccounts[callerIndex].isSuspended) {
                //console.log('make_call failed because caller is retired or suspended');
                this.socket.emit(CALL_NOT_POSSIBLE, 'error');
                return;
            } else if (!phoneAccounts[calleeIndex].isActive || phoneAccounts[calleeIndex].isSuspended) {
                this.socket.emit(CALL_NOT_POSSIBLE, 'no_recipient');
                return;
            }
            
            // double check this now that the db query has run
            if (otherPhone.phoneState !== PhoneStates.NOT_IN_CALL) {
                this.socket.emit(CALL_NOT_POSSIBLE, BUSY);
                return;
            }
        
            //this.phoneState = PhoneStates.CALL_INIT_OUTGOING;
            this.callPartner = otherPhone;
            this.billId = phoneAccounts[callerIndex].currentBill;
            this.billingPlanId = phoneAccounts[callerIndex].billingPlan;
            otherPhone.phoneState = PhoneStates.CALL_INIT_INCOMING;
            otherPhone.callPartner = this;
            otherPhone.socket.emit('call_request', this.phoneNumber);
            // console.log('make_call passed on call request');
        }
        catch (err) {
            //console.log(`make_call failed due to an error: ${err}`);
            this.socket.emit(CALL_NOT_POSSIBLE, 'error');
            this.resetCallProperties();
        }
    }

    onCallAcknowledged() {
        if (this.phoneState !== PhoneStates.CALL_INIT_INCOMING) {
            this.socket.emit('error', 'invalid_call_acknowledged');
            return;
        }

        this.phoneState = PhoneStates.CALL_INIT_INCOMING_ACKNOWLEDGED;
        this.callPartner.socket.emit('callee_ringing');
    }

    async onCallAccepted() {
        if (this.phoneState === PhoneStates.CALL_INIT_INCOMING ||
            this.phoneState === PhoneStates.CALL_INIT_INCOMING_ACKNOWLEDGED) {

            this.phoneState = PhoneStates.CALL_ACTIVE;
            this.callPartner.socket.emit('call_connected');
        }
        else if (this.phoneState === PhoneStates.CALL_INIT_OUTGOING &&
                    this.callPartner.phoneState === PhoneStates.CALL_ACTIVE) {
            try {
                // Persist to DB
                this.phoneState = PhoneStates.CALL_INIT_CREATING_DOC;
                const callDoc = new Call({
                    callerBill : this.billId,
                    calleeNumber : this.callPartner.phoneNumber
                });
                //console.log('Saving from onCallAccepted');
                await callDoc.save();

                if (this.callPartner.phoneState !== PhoneStates.CALL_ACTIVE) {
                    /* The call was disrupted (e.g. cancelled, disconnected, automatically suspended)
                     * on the callee's end while creating the document */
                    this.resetCallProperties(false);
                    await callDoc.remove();
                    return;
                }
                else if (this.phoneState !== PhoneStates.CALL_INIT_CREATING_DOC) {
                    // the call was disrupted on the caller's end
                    this.callPartner.socket.emit(CALL_CANCELLED);
                    this.resetCallProperties();
                    await callDoc.remove();
                    return;
                }
                
                this.phoneState = PhoneStates.CALL_ACTIVE;
                this.callDoc = callDoc;
                this.callPartner.callDoc = callDoc;
                
                this.callPartner.socket.emit('call_connected');
            }
            catch (err) {
                if (this.phoneState === PhoneStates.CALL_ACTIVE) {
                    //console.log('Calling closeCall from onCallAccepted (error case)');
                    await this.closeCall();
                }
                else {
                    this.resetCallProperties();
                }
            }
        }
        else {
            this.socket.emit('error', 'invalid_call_accepted');
        }
    }

    onCallRefused(reason) {
        if (this.phoneState === PhoneStates.CALL_INIT_INCOMING ||
            this.phoneState === PhoneStates.CALL_INIT_INCOMING_ACKNOWLEDGED) {
            
            this.callPartner.socket.emit(CALL_NOT_POSSIBLE, reason);
            this.resetCallProperties();
        }
        else if (this.phoneState !== PhoneStates.CALL_INIT_OUTGOING) {
            /* This is caused by another phone calling this one at the same time as this
             * one is making a call.  It is actually handled by 'make_call'. */
            // this.socket.emit('error', 'invalid_call_refused');
        }
    }

    async onHangUp() {
        switch (this.phoneState) {
            case PhoneStates.CALL_INIT_CREATING_DOC :
            case PhoneStates.CALL_ACTIVE :
                //console.log('Calling closeCall from onHangUp');
                await this.closeCall();
                break;
            case PhoneStates.CALL_INIT_OUTGOING :
                this.callPartner.socket.emit(CALL_CANCELLED);
                this.resetCallProperties();
                break;
            case PhoneStates.CALL_INIT_INCOMING :
            case PhoneStates.CALL_INIT_INCOMING_ACKNOWLEDGED :
                // this shouldn't happen, but just in case...
                this.callPartner.socket.emit(CALL_NOT_POSSIBLE, 'callee_rejected');
                this.resetCallProperties();
                break;
        }
    }

    async closeCall() {
        //console.log('In closeCall');
        //console.log(`this.phoneNumber = ${this.phoneNumber})`);
        
        if (this.callPartner) {
            this.callPartner.socket.emit(CALL_ENDED);
        }
    
        /* this condition may be false if the callee hangs up or disconnects immediately 
         * after accepting, but before the caller can be connected */
        if (this.callDoc) {
            try {
                // Process any charges on the call, then persist to the DB
                this.callDoc.endDate = Date.now();
                const bpId = this.billingPlanId || this.callPartner.billingPlanId;  // this should only be set on the caller
                const billingPlan = await BillingPlan.findById(bpId).exec();
                processCall(this.callDoc, billingPlan);
            }
            catch (err) {
                // retry?
            }
            finally {
                try {
                    //console.log('Saving from closeCall');
                    await this.callDoc.save();
                }
                catch (err) {
                }
            }
        }
    
        this.resetCallProperties();
    }

    resetCallProperties(resetPartner = true) {
        if (resetPartner && this.callPartner && 
                this.callPartner.phoneState !== PhoneStates.CALL_INIT_CREATING_DOC) {
            this.callPartner.resetCallProperties(false);
        }
        if (this.phoneState !== PhoneStates.CALL_INIT_CREATING_DOC) {
            this.phoneState = this.phoneState === PhoneStates.INVALID ? PhoneStates.INVALID : PhoneStates.NOT_IN_CALL;
            this.callPartner = null;
            this.billId = null;
            this.billingPlanId = null;
            this.callDoc = null;
        }
    }

    onTalk(msg) {
        // console.log(`talk event from ${socket.phoneNumber} to ${socket.callPartner.phoneNumber}.  msg = ${msg}`)
        if (this.phoneState === PhoneStates.CALL_ACTIVE && this.callPartner &&
            this.callPartner.phoneState === PhoneStates.CALL_ACTIVE) {

            this.callPartner.socket.emit('talk', msg);
            // console.log('talk event sent')
        }
    }
}

module.exports.init = function(server) {
    io = require('socket.io')(server, { serveClient : false });
    const redisAdapter = require('socket.io-redis');
    io.adapter(redisAdapter(process.env.REDIS_CONN));

    io.on('connection', (socket) => {
        const phone = new Phone(socket);    
        
        socket.on('disconnect', () => phone.onDisconnect());
        socket.on('register', (phoneAccountId) => phone.onRegister(phoneAccountId));
        socket.on('make_call', (phoneNumber) => phone.onMakeCall(phoneNumber));
        socket.on('call_acknowledged', () => phone.onCallAcknowledged());
        socket.on('call_accepted', () => phone.onCallAccepted());
        socket.on('hang_up', () => phone.onHangUp());
        socket.on('call_refused', (reason) => phone.onCallRefused(reason));
        socket.on('talk', (msg) => phone.onTalk(msg));
    })
}

module.exports.updatePhoneNumber = function(oldVal, newVal) {
    const phone = registry.get(oldVal);
    if (phone) {
        const other = registry.get(newVal);
        if (other) {
            throw new Error('The updated phone number is already in use.');
        }

        phone.phoneNumber = newVal;
        registry.delete(oldVal);
        registry.set(newVal, phone);
    }
}

module.exports.suspendPhone = async function(phoneNumber) {
    const phone = registry.get(phoneNumber);
    if (!phone) {
        // This isn't necessarily an error.  The phone could simply not be active/registered
        return;
    }

    const prevState = phone.phoneState;
    phone.phoneState = PhoneStates.INVALID;
    if (!(prevState === PhoneStates.INVALID || prevState === PhoneStates.NOT_IN_CALL)) {
        await phone.onHangUp();
    }
}

module.exports.unsuspendPhone = function(phoneNumber) {
    const phone = registry.get(phoneNumber);
    if (phone && phone.phoneState === PhoneStates.INVALID) {
        phone.phoneState = PhoneStates.NOT_IN_CALL;
    }
}