jest.mock('ioredis');
const Redis = require('ioredis');

test('test ioredis', () => {
    const rpop = Redis.prototype.rpop;
    rpop.mockResolvedValue('foo');

    const inst = new Redis();
    const ret = inst.rpop();
    expect(ret).resolves.toEqual('foo');
})

let PhoneManager;

jest.mock('../models/phoneAccount');
const PhoneAccount = require('../models/phoneAccount');
jest.mock('../models/billingPlan');
const BillingPlan = require('../models/billingPlan');
jest.mock('../models/call');
const Call = require('../models/call');
jest.mock('../billing/processCall');
const processCall = require('../billing/processCall');

const EventEmitter = require('events');
class MockSocket extends EventEmitter {
    async receiveEvent(eventName, ...args) {
        const listeners = this.listeners(eventName);
        if (listeners && listeners.length > 0) {
            for (let i = 0; i < listeners.length; i++) {
                const res = listeners[i](...args);
                if (res instanceof Promise) {
                    await res;
                }
            }
            return true;
        }
        return false;
    }

    emit() {
        // do nothing
    }
}

class MockObjectId {
    constructor(id) {
        this.id = id;
    }

    equals(other) {
        return other.id === this.id;
    }
}

describe('registration tests', () => {
    let mockSocket;
    let mockEmit;
    let findByIdExec;

    beforeAll(() => {
        findByIdExec = jest.fn().mockResolvedValue({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1234',
            isActive : true,
            isSuspended : false
        });
        PhoneAccount.findById.mockReturnValue({
            exec : findByIdExec
        });
    });

    beforeEach(() => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
        });
        mockSocket = new MockSocket();
        mockEmit = jest.spyOn(mockSocket, 'emit');
    })

    test.skip('registering with a valid id', async () => {
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');

        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('registered', '1234');
    });

    test.skip('registering without a valid id', async () => {
        findByIdExec.mockResolvedValueOnce();  // undefined

        PhoneManager.onConnect(mockSocket)
        await mockSocket.receiveEvent('register', 'bbb');

        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('registration_failed', 'invalid_account');
    });

    test.skip('registering with an already taken phone number', async () => {
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');

        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('registered', '1234');

        const otherSocket = new MockSocket();
        const otherEmit = jest.spyOn(otherSocket, 'emit');
        PhoneManager.onConnect(otherSocket);
        await otherSocket.receiveEvent('register', 'aaa');

        expect(otherEmit).toHaveBeenCalledTimes(1);
        expect(otherEmit).toHaveBeenLastCalledWith('registration_failed', 'phone_number_in_use');
    });
});

describe('basic make_call failure tests', () => {
    let mockSocket;
    let mockEmit;
    let findByIdExec

    beforeAll(() => {
        findByIdExec = jest.fn();
        PhoneAccount.findById.mockReturnValue({
            exec : findByIdExec
        });    
    })
    
    beforeEach(() => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
        });
        mockSocket = new MockSocket();
        mockEmit = jest.spyOn(mockSocket, 'emit');
    });

    test.skip('making a call while not registered should fail', async () => {
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('make_call', '2222');
    
        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'not_registered');
    });

    test.skip('making a call while suspended should fail', async () => {
        findByIdExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : true
        });
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');
        await mockSocket.receiveEvent('make_call', '2222');

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'not_active');
    });

    test.skip('making a call after having closed the account should fail', async () => {
        findByIdExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : false,
            isSuspended : false
        });
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');
        await mockSocket.receiveEvent('make_call', '2222');

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'not_active');
    });

    test.skip('dialing yourself should fail', async () => {
        findByIdExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : false
        });
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');
        await mockSocket.receiveEvent('make_call', '1111');

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'dialed_self');
    });

    test.skip('dialing an inactive number should fail', async () => {
        findByIdExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : false
        });
        PhoneManager.onConnect(mockSocket);
        await mockSocket.receiveEvent('register', 'aaa');
        await mockSocket.receiveEvent('make_call', '2222');

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'no_recipient');
    });
});

describe('make_call tests with two parties', () => {
    let mockSocket1111;
    let mockEmit1111;
    let mockSocket2222;
    let mockEmit2222;

    const phoneAccount1111 = {
        _id : new MockObjectId('aaa'),
        phoneNumber : '1111',
        isActive : true,
        isSuspended : false,
        billingPlan : 'billing_plan_aaa',
        currentBill : 'bill_id_aaa'
    };
    const phoneAccount2222 = {
        _id : new MockObjectId('bbb'),
        phoneNumber : '2222',
        isActive : true,
        isSuspended : false,
        billingPlan : 'billing_plan_bbb',
        currentBill : 'bill_id_bbb'
    };
    const bpDoc = {
        _id : 'billing_plan_aaa',
        pricePerMinute : '0.10'
    };

    let paFindByIdExec;
    let paFindExec;

    beforeAll(() => {
        paFindByIdExec = jest.fn();
        PhoneAccount.findById.mockReturnValue({
            exec : paFindByIdExec
        });
        paFindExec = jest.fn().mockResolvedValue([phoneAccount1111, phoneAccount2222]);
        PhoneAccount.find.mockReturnValue({
            exec : paFindExec
        });
        
        BillingPlan.findById.mockReturnValue({
            exec : jest.fn().mockResolvedValue(bpDoc)
        });

    });
    
    beforeEach(async () => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
        });
        paFindByIdExec
            .mockResolvedValueOnce(phoneAccount1111)
            .mockResolvedValueOnce(phoneAccount2222);
        Call.mockClear();
        Call.prototype.save.mockClear();
        processCall.mockClear();
        BillingPlan.findById.mockClear();

        mockSocket1111 = new MockSocket();
        mockEmit1111 = jest.spyOn(mockSocket1111, 'emit');
        PhoneManager.onConnect(mockSocket1111);
        await mockSocket1111.receiveEvent('register', 'aaa');
        mockEmit1111.mockClear();

        mockSocket2222 = new MockSocket();
        mockEmit2222 = jest.spyOn(mockSocket2222, 'emit');
        PhoneManager.onConnect(mockSocket2222);
        await mockSocket2222.receiveEvent('register', 'bbb');
        mockEmit2222.mockClear();
    });

    test.skip('make_call success, caller hangs up', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        expect(mockEmit1111).toHaveBeenCalledTimes(0);
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_request', '1111');

        await mockSocket2222.receiveEvent('call_acknowledged');
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenLastCalledWith('callee_ringing');

        await mockSocket2222.receiveEvent('call_accepted');
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');

        expect(Call).toHaveBeenCalledTimes(0);
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(1);
        expect(Call.mock.calls[0]).toEqual([{
            callerBill : 'bill_id_aaa',
            calleeNumber : '2222'
        }]);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockSocket1111.receiveEvent('talk', 'Hello, bbb');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenCalledTimes(3);
        expect(mockEmit2222).toHaveBeenLastCalledWith('talk', 'Hello, bbb');

        await mockSocket2222.receiveEvent('talk', 'Greetings, aaa');
        expect(mockEmit2222).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('talk', 'Greetings, aaa');

        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit2222).toHaveBeenCalledTimes(4);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_ended');
        expect(BillingPlan.findById).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenLastCalledWith('billing_plan_aaa');
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
    });

    test.skip('make_call success, callee hangs up', async () => {
        await mockSocket2222.receiveEvent('make_call', '1111');
        await mockSocket1111.receiveEvent('call_acknowledged');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket2222.receiveEvent('call_accepted');

        mockEmit1111.mockClear();
        mockEmit2222.mockClear();

        expect(Call).toHaveBeenCalledTimes(1);
        expect(Call.mock.calls[0]).toEqual([{
            callerBill : 'bill_id_bbb',
            calleeNumber : '1111'
        }]);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockSocket2222.receiveEvent('talk', 'Talking');
        expect(mockEmit2222).toHaveBeenCalledTimes(0);
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenLastCalledWith('talk', 'Talking');

        await mockSocket1111.receiveEvent('talk', 'Talking back');
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit2222).toHaveBeenLastCalledWith('talk', 'Talking back');
        await mockSocket2222.receiveEvent('talk', 'Talking some more...');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('talk', 'Talking some more...');

        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_ended');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(BillingPlan.findById).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenLastCalledWith('billing_plan_bbb');
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });

    test.skip('make_call twice', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('hang_up');
        expect(Call).toHaveBeenCalledTimes(1);

        mockEmit1111.mockClear();
        mockEmit2222.mockClear();

        // now call again
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenCalledTimes(3);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(2);
    });

    test.skip('make call, then receive call', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('hang_up');
        expect(Call).toHaveBeenCalledTimes(1);

        mockEmit1111.mockClear();
        mockEmit2222.mockClear();

        // now the other phone calls
        await mockSocket2222.receiveEvent('make_call', '1111');
        await mockSocket1111.receiveEvent('call_acknowledged');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket2222.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenCalledTimes(3);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(2);
    });

    test.skip('callee times out', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');

        mockEmit1111.mockClear();
        mockEmit2222.mockClear();

        await mockSocket2222.receiveEvent('call_refused', 'timeout');
        expect(mockEmit2222).toHaveBeenCalledTimes(0);
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_not_possible', 'timeout');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test.skip('caller hangs up before connecting', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');

        mockEmit1111.mockClear();
        mockEmit2222.mockClear();

        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(0);
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_cancelled');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test.skip('callee indicates busy', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_refused', 'busy');
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_not_possible', 'busy');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test.skip('caller disconnects while ringing', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        await mockSocket1111.receiveEvent('disconnect');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_cancelled');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockSocket2222.receiveEvent('make_call', '1111');
        expect(mockEmit2222).toHaveBeenCalledTimes(3);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_not_possible', 'no_recipient');
        expect(Call).toHaveBeenCalledTimes(0);
    });

    test.skip('callee disconnects while ringing', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        await mockSocket2222.receiveEvent('disconnect');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_not_possible', 'callee_disconnected');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockSocket1111.receiveEvent('make_call', '2222');
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_not_possible', 'no_recipient')
    });

    test.skip('caller disconnects during call', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);
        
        mockEmit2222.mockClear();

        await mockSocket1111.receiveEvent('disconnect');
        expect(mockEmit2222).toHaveBeenCalledTimes(1);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_ended');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });

    test.skip('callee disconnects during call', async () => {
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];

        mockEmit1111.mockClear();

        await mockSocket2222.receiveEvent('disconnect');
        expect(mockEmit1111).toHaveBeenCalledTimes(1);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_ended');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });    
});

describe('make_call tests with multiple parties', () => {
    let mockSocket1111;
    let mockEmit1111;
    let mockSocket2222;
    let mockEmit2222;
    let mockSocket3333;
    let mockEmit3333;

    const phoneAccount1111 = {
        _id : new MockObjectId('aaa'),
        phoneNumber : '1111',
        isActive : true,
        isSuspended : false,
        billingPlan : 'billing_plan_aaa',
        currentBill : 'bill_id_aaa'
    };
    const phoneAccount2222 = {
        _id : new MockObjectId('bbb'),
        phoneNumber : '2222',
        isActive : true,
        isSuspended : false,
        billingPlan : 'billing_plan_bbb',
        currentBill : 'bill_id_bbb'
    };
    const phoneAccount3333 = {
        _id : new MockObjectId('ccc'),
        phoneNumber : '3333',
        isActive : true,
        isSuspended : false,
        billingPlan : 'billing_plan_ccc',
        currentBill : 'bill_id_ccc'
    };
    const bpDocA = {
        _id : 'billing_plan_aaa',
        pricePerMinute : '0.10'
    };
    const bpDocB = {
        _id : 'billing_plan_bbb',
        pricePerMinute : '0.09'
    };
    const bpDocC = {
        _id : 'billing_plan_ccc',
        pricePerMinute : '0.08'
    };

    let paFindByIdExec;
    let paFindExec;
    let bpFindByIdExec;

    beforeAll(() => {
        paFindByIdExec = jest.fn();
        PhoneAccount.findById.mockReturnValue({
            exec : paFindByIdExec
        });
        paFindExec = jest.fn();
        PhoneAccount.find.mockReturnValue({
            exec : paFindExec
        });
        bpFindByIdExec = jest.fn();
        BillingPlan.findById.mockReturnValue({
            exec : bpFindByIdExec
        });
    });
    
    beforeEach(async () => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
        });
        paFindByIdExec
            .mockResolvedValueOnce(phoneAccount1111)
            .mockResolvedValueOnce(phoneAccount2222)
            .mockResolvedValueOnce(phoneAccount3333);
        Call.mockClear();
        Call.prototype.save.mockClear();
        processCall.mockClear();
        BillingPlan.findById.mockClear();

        mockSocket1111 = new MockSocket();
        mockEmit1111 = jest.spyOn(mockSocket1111, 'emit');
        PhoneManager.onConnect(mockSocket1111);
        await mockSocket1111.receiveEvent('register', 'aaa');
        mockEmit1111.mockClear();

        mockSocket2222 = new MockSocket();
        mockEmit2222 = jest.spyOn(mockSocket2222, 'emit');
        PhoneManager.onConnect(mockSocket2222);
        await mockSocket2222.receiveEvent('register', 'bbb');
        mockEmit2222.mockClear();

        mockSocket3333 = new MockSocket();
        mockEmit3333 = jest.spyOn(mockSocket3333, 'emit');
        PhoneManager.onConnect(mockSocket3333);
        await mockSocket3333.receiveEvent('register', 'ccc');
        mockEmit3333.mockClear();
    });

    test.skip('make_call twice, different recipients', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValue(bpDocA);
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        await mockSocket2222.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocA);

        // now for the second call
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        mockEmit1111.mockClear();
        await mockSocket1111.receiveEvent('make_call', '3333');
        await mockSocket3333.receiveEvent('call_acknowledged');
        await mockSocket3333.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_connected');
        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit3333).toHaveBeenCalledTimes(3);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocA);
    });

    test.skip('make a call, then receive a call (different parties)', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        await mockSocket2222.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocA);

        // now receive a call from 3333
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        mockEmit1111.mockClear();
        await mockSocket3333.receiveEvent('make_call', '1111');
        await mockSocket1111.receiveEvent('call_acknowledged');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket3333.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_connected');
        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit3333).toHaveBeenCalledTimes(3);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocC);
    });

    test.skip('receive a call, then make a call (different parties)', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        await mockSocket3333.receiveEvent('make_call', '1111');
        await mockSocket1111.receiveEvent('call_acknowledged');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket3333.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_connected');
        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit3333).toHaveBeenCalledTimes(3);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocC);

        // now make a call
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        mockEmit1111.mockClear();
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit2222).toHaveBeenCalledTimes(2);
        expect(mockEmit2222).toHaveBeenLastCalledWith('call_connected');
        await mockSocket2222.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_ended');
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocA);
    });

    test.skip('callee disconnects, then caller makes another call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValue(bpDocA);
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket2222.receiveEvent('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockEmit1111.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        await mockSocket1111.receiveEvent('make_call', '3333');
        await mockSocket3333.receiveEvent('call_acknowledged');
        await mockSocket3333.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockSocket1111.receiveEvent('hang_up');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenCalledTimes(3);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_ended');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocA);
    });

    test.skip('callee disconnects, then caller receives a call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockSocket1111.receiveEvent('make_call', '2222');
        await mockSocket2222.receiveEvent('call_acknowledged');
        await mockSocket2222.receiveEvent('call_accepted');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket2222.receiveEvent('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockEmit1111.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        await mockSocket3333.receiveEvent('make_call', '1111');
        await mockSocket1111.receiveEvent('call_acknowledged');
        await mockSocket1111.receiveEvent('call_accepted');
        await mockSocket3333.receiveEvent('call_accepted');
        expect(mockEmit1111).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_connected');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit3333).toHaveBeenLastCalledWith('call_connected');
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockSocket3333.receiveEvent('hang_up');
        expect(mockEmit3333).toHaveBeenCalledTimes(2);
        expect(mockEmit1111).toHaveBeenCalledTimes(3);
        expect(mockEmit1111).toHaveBeenLastCalledWith('call_ended');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocC);
    });
});