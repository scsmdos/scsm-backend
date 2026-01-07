
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    centerName: { type: String },
    // Array to store multiple course purchases
    courses: [{
        courseId: { type: String }, // 'fttp' or 'dttp'
        courseName: { type: String }, // 'Soft Skills Practice' or 'Language Skills Practice'
        subject: { type: String }, // 'CSS' or 'CLS'
        isPaid: { type: Boolean, default: false },
        orderId: { type: String },
        paymentDate: { type: Date },
        expiryDate: { type: Date },
        attemptsLeft: { type: Number, default: 30 }
    }],
    // Single Device Login Token
    sessionToken: { type: String },

    // Legacy Support (Old Schema Fields) - kept for backward compatibility
    enrolledCourse: { type: String },
    courseName: { type: String },
    isPaid: { type: Boolean },
    expiryDate: { type: Date },
    attemptsLeft: { type: Number }
}, { timestamps: true });

// Prevent recompilation of model
export default mongoose.models.User || mongoose.model('User', UserSchema);
