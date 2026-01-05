
import axios from 'axios';
import dbConnect from './utils/dbConnect.js';
import User from './models/User.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ message: 'Order ID is required' });
    }

    try {
        // 1. Verify Status with Cashfree
        const response = await axios.get(
            `https://api.cashfree.com/pg/orders/${orderId}`, // PRODUCTION URL
            {
                headers: {
                    'x-client-id': process.env.CASHFREE_APP_ID,
                    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                    'x-api-version': '2022-09-01'
                }
            }
        );

        const orderStatus = response.data.order_status;

        if (orderStatus === 'PAID') {
            // 2. Update Database
            const db = await dbConnect();
            if (db) {
                const user = await User.findOneAndUpdate(
                    { orderId: orderId },
                    { isPaid: true, paymentDate: new Date() },
                    { new: true }
                );

                if (user) {
                    return res.status(200).json({
                        success: true,
                        message: "Payment Verified",
                        user: {
                            name: user.name,
                            email: user.email,
                            mobile: user.mobile,
                            centerName: user.centerName,
                            selectedSubject: user.enrolledCourse === 'fttp' ? 'CSS' : 'CLS', // Mapping
                            attemptsLeft: user.attemptsLeft
                        }
                    });
                }
            }
            // Fallback if DB update fails but Payment is True (should not happen in healthy system)
            return res.status(200).json({ success: true, message: "Payment Verified (DB Sync Pending)" });
        } else {
            return res.status(400).json({ success: false, message: "Payment Pending or Failed" });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Verification Failed" });
    }
}
