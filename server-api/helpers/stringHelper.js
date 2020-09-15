// Borrowed from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
module.exports.escapeRegEx = function(str) {
    return str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

module.exports.moneyRegEx = /^((\$?\-?)|(\-?\$?))((\d{1,3}([, ]\d{3})*)|(\d+))(\.\d{1,2})?$/;

const moneyStringReplaceRegEx = /[$, ]/g;
module.exports.centsFromMoneyString = function(str) {
    let s = typeof str === 'string' ? str : str.toString();
    s = s.replace(moneyStringReplaceRegEx, '');
    let f = parseFloat(s);
    if (isNaN(f)) {
        throw new Error('Invalid money string');
    }
    return Math.round(f * 100);
}

// this could pull values from process.ENV if needed
/*const moneyFormatter = new Intl.NumberFormat('en-CA', {
    style : 'currency',
    currency : 'CAD',
    minimumFractionDigits : 2
});*/
module.exports.moneyStringFromCents = function(cents) {
    const flt = cents / 100;
    return flt.toFixed(2);
}