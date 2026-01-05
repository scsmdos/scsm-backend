
import dbConnect from './utils/dbConnect.js';
import User from './models/User.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { name, mobile, email } = req.body;

    if (!mobile || !email || !name) {
        return res.status(400).json({ message: 'Name, Mobile and Email are required' });
    }

    try {
        const db = await dbConnect();
        if (!db) return res.status(500).json({ message: 'Database connection failed.' });

        // Find User by Mobile and Email (Primary Keys)
        // Using case-insensitive regex for email to be safe
        const user = await User.findOne({
            mobile: mobile,
            email: { $regex: new RegExp(`^${email}$`, 'i') }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found. Please check your details or enroll.' });
        }

        // Verify Name (Case Insensitive Match)
        const dbName = user.name.toLowerCase().trim();
        const inputName = name.toLowerCase().trim();

        // Check if input name matches or is a substantial part of the db name
        if (!dbName.includes(inputName) && !inputName.includes(dbName)) {
            return res.status(401).json({ message: 'Invalid Name. Please enter the name used during enrollment.' });
        }

        if (!user.isPaid) {
            return res.status(403).json({ message: 'Payment incomplete for this user.' });
        }

        // Check Validity (20 Days Logic)
        const now = new Date();
        const expiry = new Date(user.expiryDate);

        if (now > expiry) {
            return res.status(403).json({ message: 'Your exam pack has expired. Validity: 20 Days.' });
        }

        return res.status(200).json({
            success: true,
            user: {
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                centerName: user.centerName,
                selectedSubject: user.enrolledCourse === 'fttp' ? 'CSS' : 'CLS',
                courseName: user.courseName,
                attemptsLeft: user.attemptsLeft,
                expiryDate: user.expiryDate
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
