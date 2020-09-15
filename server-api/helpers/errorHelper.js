const mongoose = require('mongoose');

module.exports.getErrorMessage = function(baseError) {
    if (baseError instanceof mongoose.Error.ValidationError && baseError.errors) {
        let message = '';
        for (const field in baseError.errors) {
            const error = baseError.errors[field];
            if (message) {
                message += '\n';
            }
            message += `${error.path}: ${error.message}`
        }
        return message;
    }
    else {
        return baseError.message;
    }
}