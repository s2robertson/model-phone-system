const BillingPlan = require('../models/billingPlan');

const StringHelper = require('../helpers/stringHelper');

module.exports.findByQuery = async function(query) {
    const queryDoc = {};

    if (query.name && typeof query.name === 'string') {
        queryDoc.name = { $regex : '^' + StringHelper.escapeRegEx(query.name) };
    }
    if (query.activeOnly !== 'false' && query.activeOnly !== false) {
        queryDoc.isActive = true;
    }

    const billingPlans = await BillingPlan.find(queryDoc)
        .select('name')
        .sort({ name : 1 })
        .exec();
    return billingPlans;
}

module.exports.findById = async function(id) {
    const billingPlan = await BillingPlan.findById(id)
        .select('-__v')
        .exec();
    return billingPlan;
}

module.exports.createBillingPlan = async function(billingPlanReq) {
    const billingPlanDoc = new BillingPlan();
    billingPlanDoc.set(billingPlanReq);

    await billingPlanDoc.save();
    return billingPlanDoc;
}

module.exports.updateBillingPlan = async function(id, billingPlanReq) {
    const billingPlanDoc = await BillingPlan.findByIdAndUpdate(id, { $set : billingPlanReq }, { runValidators : true, returnOriginal : false })
        .select('-__v')
        .exec();
    return billingPlanDoc;
}