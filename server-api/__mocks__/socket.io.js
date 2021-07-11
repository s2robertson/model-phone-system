const AwaitEventEmitter = require('../helpers/awaitEventEmitter');

const io = jest.createMockFromModule('socket.io');
io.mockImplementation((...args) => new io.Server(...args));

io.Server.prototype.on.mockImplementation(function(eventName, handler) {
    if (!this.eventEmitter) {
        this.eventEmitter = new AwaitEventEmitter();
    }
    this.eventEmitter.on(eventName, handler);
});

io.Server.prototype.use.mockImplementation(function(handler) {
    if (!this.eventEmitter) {
        this.eventEmitter = new AwaitEventEmitter();
    }
    this.eventEmitter.on('beforeConnect', handler);
});

io.Server.prototype._emit = async function(eventName, ...args) {
    if (!this.eventEmitter) {
        this.eventEmitter = new AwaitEventEmitter();
    }
    await this.eventEmitter.emit(eventName, ...args);
}

class MockSocket {
    constructor(phoneNumber) {
        this.handshake = {
            auth: {
                phoneNumber
            }
        }
        this.eventEmitter = new AwaitEventEmitter();
    }

    on(eventName, handler) {
        this.eventEmitter.on(eventName, handler);
    }

    async _emit(...args) {
        await this.eventEmitter.emit(...args);
    }

    emit() {
        // do nothing
    }
}
io.Socket = MockSocket;

module.exports = io;