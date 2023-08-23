const registry = new Map();

module.exports.get = function(phoneNumber) {
    return registry.get(phoneNumber);
}

module.exports.set = function(phoneNumber, value) {
    registry.set(phoneNumber, value);
}

module.exports.beginCall = function(primaryPhoneNumber, secondaryPhoneNumber, callId, billingPlanId) {
    // not used 
}

module.exports.endCall = function(primaryPhoneNumber, secondaryPhoneNumber) {
    // not used
}

module.exports.changeValidState = function(phoneNumber, isValid) {
    // not used
}

module.exports.delete = function(phoneNumber) {
    registry.delete(phoneNumber);
}