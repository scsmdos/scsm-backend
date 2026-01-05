
import axios from 'axios';
import dbConnect from './utils/dbConnect.js';
import User from './models/User.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { mobile, email } = req.body; // Can reference by mobile + email combo for security

    if (!mobile) {
        return res.status(400).json({ message: 'Mobile number required' });
    }

    try {
        const db = await dbConnect();
        if (!db) return res.status(500).json({ message: 'Database failure' });

        // Find Check
        const user = await User.findOne({ mobile: mobile });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.attemptsLeft <= 0) {
            return res.status(403).json({ message: 'No attempts left' });
        }

        // Decrement
        const updatedUser = await User.findOneAndUpdate(
            { mobile: mobile },
            { $inc: { attemptsLeft: -1 } },
            { new: true }
        );

        return res.status(200).json({ success: true, attemptsLeft: updatedUser.attemptsLeft });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server Error' });
    }
}
