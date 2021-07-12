// admin/admin
db.admins.insertOne({
    name: "admin",
    password: "$2b$10$/IYqYlWOmzf1Zpe4uvY5K.gAEjJZvbVI0M3/mqZDaUYrnvCHPJVSi"
})

var johnSmithId = new ObjectId();
var jackBlackId = new ObjectId();
var janeDoeId = new ObjectId();

db.customers.insertMany([
    {
        _id: johnSmithId,
        firstName: "John",
        lastName: "Smith",
        address: {
            streetAddress: "1 Main St",
            city: "Centreville",
            postalCode: "A1A1A1"
        },
        email: "jsmith@email.com"
    },
    {
        _id: jackBlackId,
        firstName: "Jack",
        lastName: "Black",
        address: {
            streetAddress: "2 Main St",
            city: "Anywhere City",
            postalCode: "B2B2B2"
        },
        email: "jblack@email.com"
    },
    {
        _id: janeDoeId,
        firstName: "Jane",
        lastName: "Doe",
        address: {
            streetAddress: "3 Main St",
            city: "Nowhere City",
            postalCode: "C3C3C3"
        },
        email: "jdoe@email.com"
    }
])

var basicBpId = new ObjectId();
var discountBpId = new ObjectId();

db.billingplans.insertMany([
    {
        _id: basicBpId,
        name: "Basic",
        pricePerMonth: "9.99",
        pricePerMinute: "0.05",
        discountPeriods: [],
        isActive: true
    },
    {
        _id: discountBpId,
        name: "Discounted Evenings/Weekends",
        pricePerMonth: "12.99",
        pricePerMinute: "0.05",
        discountPeriods: [
            {
                dayOfWeek: 0,
                startHour: 0,
                startMinute: 0,
                endHour: 23,
                endMinute: 59,
                pricePerMinute: "0.02"
            },
            {
                dayOfWeek: 6,
                startHour: 0,
                startMinute: 0,
                endHour: 23,
                endMinute: 59,
                pricePerMinute: "0.02"
            },
            {
                dayOfWeek: 7,
                startHour: 19,
                startMinute: 0,
                endHour: 23,
                endMinute: 59,
                pricePerMinute: "0.02"
            }
        ],
        isActive: true
    }
])

var johnSmithPhoneId = new ObjectId();
var johnSmithBillId = new ObjectId();
var jackBlackPhoneId = new ObjectId();
var jackBlackBillId = new ObjectId();
var janeDoePhoneId = new ObjectId();
var janeDoeBillId = new ObjectId();

db.phoneaccounts.insertMany([
    {
        _id: johnSmithPhoneId,
        customer: johnSmithId,
        billingPlan: basicBpId,
        phoneNumber: "0001",
        isActive: true,
        isSuspended: false,
        currentBill: johnSmithBillId
    },
    {
        _id: jackBlackPhoneId,
        customer: jackBlackId,
        billingPlan: discountBpId,
        phoneNumber: "0002",
        isActive: true,
        isSuspended: false,
        currentBill: jackBlackBillId
    },
    {
        _id: janeDoePhoneId,
        customer: janeDoeId,
        billingPlan: discountBpId,
        phoneNumber: "0003",
        isActive: true,
        isSuspended: false,
        currentBill: janeDoeBillId
    }
])

var startDate = new Date();

db.bills.insertMany([
    {
        _id: johnSmithBillId,
        phoneAccount: johnSmithPhoneId,
        startDate: startDate,
        billingPlans: [
            {
                billingPlan: basicBpId,
                startDate: startDate
            }
        ]
    },
    {
        _id: jackBlackBillId,
        phoneAccount: jackBlackPhoneId,
        startDate: startDate,
        billingPlans: [
            {
                billingPlan: discountBpId,
                startDate: startDate
            }
        ]
    },
    {
        _id: janeDoeBillId,
        phoneAccount: janeDoePhoneId,
        startDate: startDate,
        billingPlans: [
            {
                billingPlan: discountBpId,
                startDate: startDate
            }
        ]
    }
])