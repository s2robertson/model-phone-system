const EventEmitter = require('events');

// this class is meant for testing, not normal use
class AwaitEventEmitter extends EventEmitter {
    async emit(eventName, ...args) {
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
}

module.exports = AwaitEventEmitter;