const AwaitEventEmitter = require('../helpers/awaitEventEmitter');

const Redis = jest.createMockFromModule('ioredis');

Redis.prototype.duplicate.mockImplementation(() => new Redis());

Redis.prototype.on.mockImplementation(function(eventName, handler) {
    if (!this.eventEmitter) {
        this.eventEmitter = new AwaitEventEmitter();
    }
    this.eventEmitter.on(eventName, handler);
});

Redis.prototype.hgetall.mockResolvedValue({});

Redis.prototype._emit = async function(eventName, ...args) {
    if (!this.eventEmitter) {
        this.eventEmitter = new AwaitEventEmitter();
    }
    await this.eventEmitter.emit(eventName, ...args);
}

Redis.prototype.multi.mockImplementation(() => new Redis.Pipeline());

// these methods are normally the exact same methods as on Redis.prototype, which creates screwy results
Redis.Pipeline.prototype.hset = jest.fn().mockReturnThis();
Redis.Pipeline.prototype.hdel = jest.fn().mockReturnThis();

module.exports = Redis;