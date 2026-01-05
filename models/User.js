
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    centerName: { type: String },
    isPaid: { type: Boolean, default: false },
    enrolledCourse: { type: String }, // 'fttp' or 'dttp'
    courseName: { type: String },
    paymentDate: { type: Date },
    expiryDate: { type: Date },
    attemptsLeft: { type: Number, default: 30 },
    orderId: { type: String }
}, { timestamps: true });

// Prevent recompilation of model
export default mongoose.models.User || mongoose.model('User', UserSchema);
