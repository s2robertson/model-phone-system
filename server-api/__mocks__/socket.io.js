const EventEmitter = require('events');

async function doAsyncEmit(eventName, ...args) {
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

class AwaitEventEmitter extends EventEmitter {
    async emit(...args) {
        await doAsyncEmit.apply(this, args);
    }
}
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

class MockSocket extends EventEmitter {
    constructor(phoneNumber) {
        super();
        this.handshake = {
            auth: {
                phoneNumber
            }
        }
    }
    async _emit(...args) {
        await doAsyncEmit.apply(this, args);
    }

    emit() {
        // do nothing
    }
}
io.Socket = MockSocket;

module.exports = io;