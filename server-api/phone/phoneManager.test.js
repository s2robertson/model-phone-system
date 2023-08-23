let PhoneManager;

const flushPromises = () => new Promise(setImmediate);
// jest.useFakeTimers();

jest.mock('./socketIoRemotePhone');
let MockRemotePhone = require('./socketIoRemotePhone');

jest.mock('socket.io');
let io = require('socket.io');
let MockSocket = io.Socket;

jest.mock('ioredis');
let Redis = require('ioredis');

beforeEach(() => {
    io.mockClear();
    io.Server.mockClear();
    MockRemotePhone.mockClear();
    Redis.mockClear();
    Redis.Pipeline.mockClear();
});

test('Test server mock creation', () => {
    const server = io('foo', 'bar');
    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenLastCalledWith('foo', 'bar');
    expect(server).toBe(io.Server.mock.instances[0]);
    expect(io.Server).toBeCalledTimes(1);
    expect(io.Server).toHaveBeenLastCalledWith('foo', 'bar');

    const cb = jest.fn();
    server.use(cb);
    const onConnect = jest.fn();
    server.on('connection', onConnect);
    server._emit('beforeConnect');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledTimes(0);
    server._emit('connection');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledTimes(1);

    // this is to ensure that "this" has the correct value in the mock implemented methods
    expect(server.hasOwnProperty('eventEmitter')).toBeTruthy();
});

jest.mock('../models/phoneAccount');
let PhoneAccount = require('../models/phoneAccount');
jest.mock('../models/billingPlan');
let BillingPlan = require('../models/billingPlan');
jest.mock('../models/call');
let Call = require('../models/call');
jest.mock('../billing/processCall');
let processCall = require('../billing/processCall');

class MockObjectId {
    constructor(id) {
        this.id = id;
    }

    equals(other) {
        if (other instanceof MockObjectId) {
            return this.id === other.id;
        }
        else if (typeof other === 'string') {
            return this.id === other;
        }
        return false;
    }
}

let SocketIoPhoneAdapter;

describe('registration tests', () => {
    let server;
    let mockSocket;
    let mockEmit;
    let findOneExec;

    beforeAll(() => {
        findOneExec = jest.fn().mockResolvedValue({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1234',
            isActive : true,
            isSuspended : false
        });
        PhoneAccount.findOne.mockReturnValue({
            exec : findOneExec
        });
    });

    beforeEach(() => {
        jest.isolateModules(() => {
            // PhoneManager = require('./phoneManager');
            SocketIoPhoneAdapter = require('./socketIoPhoneAdapter');
        });
        SocketIoPhoneAdapter(null);
        //PhoneManager.init(null);
        server = io.Server.mock.instances[0];
        mockSocket = new MockSocket('1234');
        mockEmit = jest.spyOn(mockSocket, 'emit');
    });

    test('registering with a valid id', async () => {
        const next = jest.fn();
        await server._emit('beforeConnect', mockSocket, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0].length).toBe(0);

        await server._emit('connection', mockSocket);

        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('registered', '1234');
    });

    test('registering without a valid id', async () => {
        findOneExec.mockResolvedValueOnce();  // undefined
        const next = jest.fn();
        await server._emit('beforeConnect', mockSocket, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0].length).toBe(1);
        expect(next.mock.calls[0][0] instanceof Error).toBe(true);  // Is there additional verification to do here?

        expect(mockEmit).toHaveBeenCalledTimes(0);
    });

    /*test.skip('registering with an already taken phone number', async () => {
        PhoneManager.onConnect(mockSocket);
        await mockSocket._emit('register', 'aaa');

        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('registered', '1234');

        const otherSocket = new MockSocket();
        const otherEmit = jest.spyOn(otherSocket, 'emit');
        PhoneManager.onConnect(otherSocket);
        await otherSocket._emit('register', 'aaa');

        expect(otherEmit).toHaveBeenCalledTimes(1);
        expect(otherEmit).toHaveBeenLastCalledWith('registration_failed', 'phone_number_in_use');
    });*/
});

describe('basic make_call failure tests', () => {
    let server;
    let mockSocket;
    let mockPhone;
    let findOneExec

    beforeAll(() => {
        findOneExec = jest.fn();
        PhoneAccount.findOne.mockReturnValue({
            exec : findOneExec
        });
    });
    
    beforeEach(() => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
            SocketIoPhoneAdapter = require('./socketIoPhoneAdapter');
        });
        SocketIoPhoneAdapter(null);
        // PhoneManager.init(null);
        server = io.Server.mock.instances[0];
        mockSocket = new MockSocket('1111');
    });

    /*test.skip('making a call while not registered should fail', async () => {
        PhoneManager.onConnect(mockSocket);
        await mockSocket._emit('make_call', '2222');
    
        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'not_registered');
    });*/

    test('making a call while suspended should fail', async () => {
        findOneExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : true
        });
        await server._emit('beforeConnect', mockSocket, jest.fn());
        await server._emit('connection', mockSocket);
        mockPhone = MockRemotePhone.instances[0];
        await mockPhone.emit('make_call', '2222');
        
        expect(mockPhone.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone.signalCallNotPossible).toHaveBeenLastCalledWith('not_active');
    });

    /*test.skip('making a call after having closed the account should fail', async () => {
        findOneExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : false,
            isSuspended : false
        });
        //* the mocking here might want revising--under regular operation, the phone account being 
        //* inactive would cause the db query to fail, which would prevent the phone from being registered
        //* with the PhoneManager in the first place
        await server._emit('beforeConnect', mockSocket, jest.fn());
        await server._emit('connection', mockSocket);
        await mockSocket._emit('make_call', '2222');

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit).toHaveBeenLastCalledWith('call_not_possible', 'not_active');
    });*/

    test('dialing yourself should fail', async () => {
        findOneExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : false
        });
        await server._emit('beforeConnect', mockSocket, jest.fn());
        await server._emit('connection', mockSocket);
        mockPhone = MockRemotePhone.instances[0];
        await mockPhone.emit('make_call', '1111');
        
        expect(mockPhone.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone.signalCallNotPossible).toHaveBeenLastCalledWith('dialed_self');
    });

    test('dialing an inactive number should fail', async () => {
        findOneExec.mockResolvedValueOnce({
            _id : new MockObjectId('aaa'),
            phoneNumber : '1111',
            isActive : true,
            isSuspended : false
        });
        await server._emit('beforeConnect', mockSocket, jest.fn());
        await server._emit('connection', mockSocket);
        mockPhone = MockRemotePhone.instances[0];
        await mockPhone.emit('make_call', '2222');
        
        expect(mockPhone.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone.signalCallNotPossible).toHaveBeenLastCalledWith('no_recipient');
    });
});

describe('make_call tests with two parties', () => {
    let server;
    let mockSocket1111;
    let mockPhone1111;
    let mockSocket2222;
    let mockPhone2222;

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

    let paFindOneExec;
    let paFindExec;

    beforeAll(() => {
        paFindOneExec = jest.fn();
        PhoneAccount.findOne.mockReturnValue({
            exec : paFindOneExec
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
            SocketIoPhoneAdapter = require('./socketIoPhoneAdapter');
        });
        SocketIoPhoneAdapter(null);
        // PhoneManager.init(null);
        server = io.Server.mock.instances[0];
        paFindOneExec
            .mockResolvedValueOnce(phoneAccount1111)
            .mockResolvedValueOnce(phoneAccount2222);
        Call.mockClear();
        Call.prototype.save.mockClear();
        processCall.mockClear();
        BillingPlan.findById.mockClear();

        mockSocket1111 = new MockSocket('1111');
        await server._emit('beforeConnect', mockSocket1111, jest.fn());
        await server._emit('connection', mockSocket1111);
        mockPhone1111 = MockRemotePhone.instances[0];

        mockSocket2222 = new MockSocket('2222');
        await server._emit('beforeConnect', mockSocket2222, jest.fn());
        await server._emit('connection', mockSocket2222);
        mockPhone2222 = MockRemotePhone.instances[1];
    });

    test('make_call success, caller hangs up', async () => {
        await mockPhone1111.emit('make_call', '2222');
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(0);
        expect(mockPhone2222.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallRequest).toHaveBeenLastCalledWith('1111');

        await mockPhone2222.emit('call_acknowledged', '1111');
        expect(mockPhone1111.signalCalleeRinging).toHaveBeenCalledTimes(1);

        await mockPhone2222.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        expect(Call).toHaveBeenCalledTimes(0);
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
        expect(Call.mock.calls[0]).toEqual([{
            callerBill : 'bill_id_aaa',
            calleeNumber : '2222'
        }]);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('talk', 'Hello, bbb');
        expect(mockPhone2222.signalIncomingTalk).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalIncomingTalk).toHaveBeenLastCalledWith('Hello, bbb');

        await mockPhone2222.emit('talk', 'Greetings, aaa');
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenLastCalledWith('Greetings, aaa');

        await mockPhone1111.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenLastCalledWith('billing_plan_aaa');
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
    });

    test('make_call success, callee hangs up', async () => {
        await mockPhone2222.emit('make_call', '1111');
        await mockPhone1111.emit('call_acknowledged', '2222');
        await mockPhone1111.emit('call_accepted');
        await mockPhone2222.emit('call_accepted');

        expect(Call).toHaveBeenCalledTimes(1);
        expect(Call.mock.calls[0]).toEqual([{
            callerBill : 'bill_id_bbb',
            calleeNumber : '1111'
        }]);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone2222.emit('talk', 'Talking');
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenLastCalledWith('Talking');

        await mockPhone1111.emit('talk', 'Talking back');
        expect(mockPhone2222.signalIncomingTalk).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalIncomingTalk).toHaveBeenLastCalledWith('Talking back');
        await mockPhone2222.emit('talk', 'Talking some more...');
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenCalledTimes(2);
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenLastCalledWith('Talking some more...');

        await mockPhone1111.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(BillingPlan.findById).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenLastCalledWith('billing_plan_bbb');
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });

    test('make_call twice', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone1111.emit('hang_up');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone1111.mockClear();
        mockPhone2222.mockClear();

        // now call again
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone1111.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
    });

    test('make call, then receive call', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone1111.emit('hang_up');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone1111.mockClear();
        mockPhone2222.mockClear();

        // now the other phone calls
        await mockPhone2222.emit('make_call', '1111');
        await mockPhone1111.emit('call_acknowledged', '2222');
        await mockPhone1111.emit('call_accepted');
        await mockPhone2222.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone1111.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
    });

    test('callee times out', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');

        mockPhone1111.mockClear();
        mockPhone2222.mockClear();

        await mockPhone2222.emit('call_refused', '1111', 'timeout');
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('timeout');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test('caller hangs up before connecting', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');

        mockPhone1111.mockClear();
        mockPhone2222.mockClear();

        await mockPhone1111.emit('hang_up');
        expect(mockPhone2222.signalCallCancelled).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test('callee indicates busy', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_refused', '1111', 'busy');
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('busy');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
    });

    test('caller disconnects while ringing', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone1111.emit('disconnect');
        expect(mockPhone2222.signalCallCancelled).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockPhone2222.emit('make_call', '1111');
        expect(mockPhone2222.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallNotPossible).toHaveBeenLastCalledWith('no_recipient');
        expect(Call).toHaveBeenCalledTimes(0);
    });

    test('callee disconnects while ringing', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('disconnect');
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('callee_disconnected');
        expect(Call).toHaveBeenCalledTimes(0);

        // try calling again
        await mockPhone1111.emit('make_call', '2222');
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(2);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('no_recipient')
    });

    test('caller disconnects during call', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);
        
        await mockPhone1111.emit('disconnect');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });

    test('callee disconnects during call', async () => {
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];

        await mockPhone2222.emit('disconnect');
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDoc);
    });    
});

describe('make_call tests with multiple parties', () => {
    let server;
    let mockSocket1111;
    let mockPhone1111;
    let mockSocket2222;
    let mockPhone2222;
    let mockSocket3333;
    let mockPhone3333;

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

    let paFindOneExec;
    let paFindExec;
    let bpFindByIdExec;

    beforeAll(() => {
        paFindOneExec = jest.fn();
        PhoneAccount.findOne.mockReturnValue({
            exec : paFindOneExec
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
            SocketIoPhoneAdapter = require('./socketIoPhoneAdapter');
        });
        SocketIoPhoneAdapter(null);
        // PhoneManager.init(null);
        server = io.Server.mock.instances[0];
        paFindOneExec
            .mockResolvedValueOnce(phoneAccount1111)
            .mockResolvedValueOnce(phoneAccount2222)
            .mockResolvedValueOnce(phoneAccount3333);
        Call.mockClear();
        Call.prototype.save.mockClear();
        processCall.mockClear();
        BillingPlan.findById.mockClear();

        mockSocket1111 = new MockSocket('1111');
        await server._emit('beforeConnect', mockSocket1111, jest.fn());
        await server._emit('connection', mockSocket1111);
        mockPhone1111 = MockRemotePhone.instances[0];

        mockSocket2222 = new MockSocket('2222');
        await server._emit('beforeConnect', mockSocket2222, jest.fn());
        await server._emit('connection', mockSocket2222);
        mockPhone2222 = MockRemotePhone.instances[1];

        mockSocket3333 = new MockSocket('3333');
        await server._emit('beforeConnect', mockSocket3333, jest.fn());
        await server._emit('connection', mockSocket3333);
        mockPhone3333 = MockRemotePhone.instances[2];
    });

    test('make_call twice, different recipients', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValue(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone2222.emit('hang_up');
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocA);

        // now for the second call
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        mockPhone1111.mockClear();
        await mockPhone1111.emit('make_call', '3333');
        await mockPhone3333.emit('call_acknowledged', '1111');
        await mockPhone3333.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone1111.emit('hang_up');
        expect(mockPhone3333.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocA);
    });

    test('make a call, then receive a call (different parties)', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone2222.emit('hang_up');
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocA);

        // now receive a call from 3333
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        mockPhone1111.mockClear();
        await mockPhone3333.emit('make_call', '1111');
        await mockPhone1111.emit('call_acknowledged', '3333');
        await mockPhone1111.emit('call_accepted');
        await mockPhone3333.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone1111.emit('hang_up');
        expect(mockPhone3333.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocC);
    });

    test('receive a call, then make a call (different parties)', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        await mockPhone3333.emit('make_call', '1111');
        await mockPhone1111.emit('call_acknowledged', '3333');
        await mockPhone1111.emit('call_accepted');
        await mockPhone3333.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone1111.emit('hang_up');
        expect(mockPhone3333.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[0], bpDocC);

        // now make a call
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        mockPhone1111.mockClear();
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        await mockPhone2222.emit('hang_up');
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(Call.mock.instances[1], bpDocA);
    });

    test('callee disconnects, then caller makes another call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValue(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone2222.emit('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone1111.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        await mockPhone1111.emit('make_call', '3333');
        await mockPhone3333.emit('call_acknowledged', '1111');
        await mockPhone3333.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('hang_up');
        expect(mockPhone3333.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocA);
    });

    test('callee disconnects, then caller receives a call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone2222.emit('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone1111.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        await mockPhone3333.emit('make_call', '1111');
        await mockPhone1111.emit('call_acknowledged', '3333');
        await mockPhone1111.emit('call_accepted');
        await mockPhone3333.emit('call_accepted');
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone3333.emit('hang_up');
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocC);
    });

    test('caller disconnects, then callee makes a call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone1111.emit('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone2222.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount2222, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocB);
        await mockPhone2222.emit('make_call', '3333');
        await mockPhone3333.emit('call_acknowledged', '2222');
        await mockPhone3333.emit('call_accepted');
        await mockPhone2222.emit('call_accepted');
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone3333.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocB);
    });

    test('caller disconnects, then callee receives another call', async () => {
        paFindExec.mockResolvedValueOnce([phoneAccount1111, phoneAccount2222]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocA);
        await mockPhone1111.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '1111');
        await mockPhone2222.emit('call_accepted');
        await mockPhone1111.emit('call_accepted');
        await mockPhone1111.emit('disconnect');
        expect(Call).toHaveBeenCalledTimes(1);

        mockPhone2222.mockClear();
        Call.prototype.save.mockClear();
        paFindExec.mockResolvedValueOnce([phoneAccount2222, phoneAccount3333]);
        bpFindByIdExec.mockResolvedValueOnce(bpDocC);
        await mockPhone3333.emit('make_call', '2222');
        await mockPhone2222.emit('call_acknowledged', '3333');
        await mockPhone2222.emit('call_accepted');
        await mockPhone3333.emit('call_accepted');
        expect(mockPhone2222.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(mockPhone3333.signalCallConnected).toHaveBeenCalledTimes(1);
        expect(Call).toHaveBeenCalledTimes(2);
        const callDoc = Call.mock.instances[1];
        expect(callDoc.save).toHaveBeenCalledTimes(1);

        await mockPhone3333.emit('hang_up');
        expect(mockPhone2222.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenCalledTimes(2);
        expect(processCall).toHaveBeenLastCalledWith(callDoc, bpDocC);
    })
});

describe.skip('tests involving remote phones', () => {
    let server;
    let mockSocket1111;
    let mockPhone1111;
    
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
    const bpDocA = {
        _id : 'billing_plan_aaa',
        pricePerMinute : '0.10'
    };
    const bpDocB = {
        _id : 'billing_plan_bbb',
        pricePerMinute : '0.09'
    };
    const mockCallDoc = {
        _id : 'mock_call_doc',
        save : jest.fn()
    }
    
    let paFindOneExec;
    let paFindExec;
    let bpFindByIdExec;
    let callFindByIdExec;

    let redisClient;
    let subClient;

    beforeAll(() => {
        jest.useFakeTimers();
        paFindOneExec = jest.fn().mockResolvedValue(phoneAccount1111);
        PhoneAccount.findOne.mockReturnValue({
            exec : paFindOneExec
        });
        paFindExec = jest.fn().mockResolvedValue([phoneAccount1111, phoneAccount2222]);
        PhoneAccount.find.mockReturnValue({
            exec : paFindExec
        });
        bpFindByIdExec = jest.fn().mockResolvedValue(bpDocA);
        BillingPlan.findById.mockReturnValue({
            exec : bpFindByIdExec
        });
        callFindByIdExec = jest.fn().mockResolvedValue(mockCallDoc);
        Call.findById.mockReturnValue({
            exec : callFindByIdExec
        });
        Redis.prototype.hgetall.mockResolvedValue({
            accountId : 'bbb',
            isValid : "true",
            callId : null,
            callBpId : null
        });
    });

    afterAll(() => {
        jest.useRealTimers();
    })
    
    beforeEach(async () => {
        jest.isolateModules(() => {
            PhoneManager = require('./phoneManager');
            SocketIoPhoneAdapter = require('./socketIoPhoneAdapter');
        });
        
        SocketIoPhoneAdapter(null);
        server = io.Server.mock.instances[0];
        redisClient = Redis.mock.instances[0];
        subClient = Redis.mock.instances[1];

        Call.mockClear();
        Call.findById.mockClear();
        Call.prototype.save.mockClear();
        processCall.mockClear();
        BillingPlan.findById.mockClear();

        Redis.Pipeline.prototype.hset.mockClear();
        Redis.Pipeline.prototype.hdel.mockClear();
        
        mockSocket1111 = new MockSocket('1111');
        await server._emit('beforeConnect', mockSocket1111, jest.fn());
        await server._emit('connection', mockSocket1111);
        mockPhone1111 = MockRemotePhone.instances[0];
    });

    test('calling a remote phone, local phone hangs up', async () => {
        // verify that redis data was set on connection
        expect(redisClient.hset).toHaveBeenCalledTimes(1);
        expect(redisClient.hset).toHaveBeenLastCalledWith('phone:1111', 'accountId', phoneAccount1111._id, 'isValid', true);
        
        await mockPhone1111.emit('make_call', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_request', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['callee_ringing']));
        expect(mockPhone1111.signalCalleeRinging).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(1);

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_connected', '2222']));
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_connected', '1111']));
        
        // verify that redis data was updated when the Call was created
        expect(redisClient.multi).toHaveBeenCalledTimes(1);
        expect(Redis.Pipeline).toHaveBeenCalledTimes(1);
        let multi = Redis.Pipeline.mock.instances[0];
        expect(multi.hset).toHaveBeenCalledTimes(2);
        expect(multi.hset).toHaveBeenCalledWith('phone:1111', 'callId', callDoc.id, 'callBpId', phoneAccount1111.billingPlan);
        expect(multi.hset).toHaveBeenCalledWith('phone:2222', 'callId', callDoc.id, 'callBpId', phoneAccount1111.billingPlan);
        expect(multi.exec).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('talk', 'Hello, remote phone');
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['talk', 'Hello, remote phone']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['talk', 'Response from remote phone']));
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalIncomingTalk).toHaveBeenLastCalledWith('Response from remote phone');

        await mockPhone1111.emit('hang_up');
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenCalledTimes(4);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_ended', '1111', false]));

        // verify that redis data was updated when the Call ended
        expect(redisClient.multi).toHaveBeenCalledTimes(2);
        expect(Redis.Pipeline).toHaveBeenCalledTimes(2);
        multi = Redis.Pipeline.mock.instances[1];
        expect(multi.hdel).toHaveBeenCalledTimes(2);
        expect(multi.hdel).toHaveBeenCalledWith('phone:1111', 'callId', 'callBpId');
        expect(multi.hdel).toHaveBeenCalledWith('phone:2222', 'callId', 'callBpId');
        expect(multi.exec).toHaveBeenCalledTimes(1);
    });

    test('calling a remote phone, remote phone hangs up', async () => {
        await mockPhone1111.emit('make_call', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_request', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['callee_ringing']));
        expect(mockPhone1111.signalCalleeRinging).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(1);

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_connected', '2222']));
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('call_accepted');
        expect(Call).toHaveBeenCalledTimes(1);
        const callDoc = Call.mock.instances[0];
        expect(callDoc.save).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_connected', '1111']));

        // close call remotely
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_ended', '2222', true]));
        jest.useRealTimers();
        await flushPromises();
        jest.useFakeTimers();
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(callDoc.save).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['close_call_ack', '1111']));
        expect(Redis.Pipeline).toHaveBeenCalledTimes(2);
        const multi = Redis.Pipeline.mock.instances[1];
        expect(multi.hdel).toHaveBeenCalledTimes(2);
        expect(multi.hdel).toHaveBeenCalledWith('phone:1111', 'callId', 'callBpId');
        expect(multi.hdel).toHaveBeenCalledWith('phone:2222', 'callId', 'callBpId');
        expect(multi.exec).toHaveBeenCalledTimes(1);
    });

    test('called by remote phone, remote phone hangs up', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_acknowledged', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['callee_ringing']));

        await mockPhone1111.emit('call_accepted');
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_connected', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_connected', '2222']));
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_ended', '2222', false]));
        expect(mockPhone1111.signalCallEnded).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
    });

    test('called by a remote phone, local phone hangs up, receives ack', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_acknowledged', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['callee_ringing']));

        await mockPhone1111.emit('call_accepted');
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_connected', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_connected', '2222']));
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('hang_up');
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_ended', '1111', true]));
        expect(processCall).not.toHaveBeenCalled();

        await subClient._emit('message', 'phone:1111', JSON.stringify(['close_call_ack', '2222']));
        jest.runAllTimers();
        jest.useRealTimers();
        await flushPromises();
        jest.useFakeTimers();
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(processCall).not.toHaveBeenCalled();
    });

    test.skip('called by a remote phone, local phone hangs up, does not receive ack', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_acknowledged', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['callee_ringing']));

        await mockPhone1111.emit('call_accepted');
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_connected', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_connected', '2222']));
        expect(mockPhone1111.signalCallConnected).toHaveBeenCalledTimes(1);

        await mockPhone1111.emit('hang_up');
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_ended', '1111', true]));
        expect(redisClient.multi).not.toHaveBeenCalled();
        expect(processCall).not.toHaveBeenCalled();

        redisClient.hgetall.mockResolvedValueOnce({
            accountId : phoneAccount1111._id,
            isValid : "true",
            callId : mockCallDoc._id,
            callBpId : bpDocB._id
        });
        bpFindByIdExec.mockResolvedValueOnce(bpDocB);
        jest.runAllTimers();
        jest.useRealTimers();
        await flushPromises();
        jest.useFakeTimers();
        expect(Call.findById).toBeCalledTimes(1);
        expect(Call.findById).toHaveBeenLastCalledWith(mockCallDoc._id);
        expect(BillingPlan.findById).toHaveBeenCalledTimes(1);
        expect(BillingPlan.findById).toHaveBeenLastCalledWith(bpDocB._id);
        expect(mockCallDoc.save).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenCalledTimes(1);
        expect(processCall).toHaveBeenLastCalledWith(mockCallDoc, bpDocB);
        expect(redisClient.publish).toHaveBeenCalledTimes(3);
        expect(redisClient.multi).toHaveBeenCalledTimes(1);
        const multi = Redis.Pipeline.mock.instances[0];
        expect(multi.hdel).toHaveBeenCalledTimes(2);
        expect(multi.hdel).toHaveBeenCalledWith('phone:1111', 'callId', 'callBpId');
        expect(multi.hdel).toHaveBeenCalledWith('phone:2222', 'callId', 'callBpId');
    });

    test('calling a remote phone, remote phone refuses', async () => {
        await mockPhone1111.emit('make_call', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_request', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_refused', '2222', 'busy']));
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('busy');
    });

    test('calling a remote phone, remote phone acknowledges, but then cancels', async () => {
        await mockPhone1111.emit('make_call', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_request', '1111']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['callee_ringing']));
        expect(mockPhone1111.signalCalleeRinging).toHaveBeenCalledTimes(1);
        
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_refused', '2222', 'callee_disconnected']));
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallNotPossible).toHaveBeenLastCalledWith('callee_disconnected');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
    });

    test('called by a remote phone, local phone refuses', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_refused', '2222', 'busy');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_refused', '1111', 'busy']));
    });

    test('called by a remote phone, local phone acknowledges, but then cancels', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_acknowledged', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['callee_ringing']));

        await mockPhone1111.emit('disconnect');
        expect(redisClient.publish).toHaveBeenCalledTimes(2);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['call_refused', '1111', 'callee_disconnected']));
    });

    test('called by a remote phone, remote phone cancels', async () => {
        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_request', '2222']));
        expect(mockPhone1111.signalCallRequest).toHaveBeenCalledTimes(1);
        expect(mockPhone1111.signalCallRequest).toHaveBeenLastCalledWith('2222');

        await mockPhone1111.emit('call_acknowledged', '2222');
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenLastCalledWith('phone:2222', JSON.stringify(['callee_ringing']));

        await subClient._emit('message', 'phone:1111', JSON.stringify(['call_cancelled', '2222']));
        expect(mockPhone1111.signalCallCancelled).toHaveBeenCalledTimes(1);
        expect(redisClient.publish).toHaveBeenCalledTimes(1);
    });
})