const express = require('express');
const router = express.Router();
const customerRoutes = require('./routes/customers');
const phoneAccountRoutes = require('./routes/phoneAccounts');
const billingPlanRoutes = require('./routes/billingPlans');
const billRoutes = require('./routes/bills');
const auth = require('./middleware/auth');

router.use("/customers", customerRoutes);
router.use('/phoneAccounts', phoneAccountRoutes);
router.use("/billingPlans", billingPlanRoutes);
router.use('/bills', billRoutes);

router.get('/logIn', auth.logInGet);
router.post('/logIn', auth.logInPost);
router.get('/logout', auth.logOut);

module.exports = router;