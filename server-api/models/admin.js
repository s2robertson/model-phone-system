const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const adminSchema = mongoose.Schema({
    name : {
        type : String,
        required : true,
        unique : true
    },
    password : {
        type : String,
        required : true
    }
});

adminSchema.method('comparePassword', async function (other) {
    return bcrypt.compare(other, this.password);
});


async function hashPassword() {
    let password = this.get('password');
    if (password) {
        password = await bcrypt.hash(password, saltRounds);
        this.set('password', password);
    }
}

adminSchema.pre('save', hashPassword);
adminSchema.pre('findOneAndUpdate', hashPassword);


module.exports = mongoose.model('Admin', adminSchema);