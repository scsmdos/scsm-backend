
import axios from 'axios';
import dbConnect from './utils/dbConnect.js';
import User from './models/User.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // 1. Get Data from Client
    const { customerId, customerName, customerPhone, customerEmail, orderAmount, returnUrl, courseId, centerName } = req.body;

    // 2. Validate
    if (!customerName || !customerPhone || !customerEmail || !orderAmount) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const orderId = "ORDER_" + Date.now();

    // 3. Save "Pending" User to MongoDB
    try {
        const db = await dbConnect();
        if (db) {
            // Upsert: Update if mobile exists, otherwise create
            const validityDays = 20;
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + validityDays);

            await User.findOneAndUpdate(
                { mobile: customerPhone },
                {
                    name: customerName,
                    email: customerEmail,
                    mobile: customerPhone,
                    centerName: centerName || 'Online Student',
                    isPaid: false, // Not paid yet
                    orderId: orderId,
                    enrolledCourse: courseId, // 'fttp' or 'dttp'
                    courseName: courseId === 'fttp' ? 'Soft Skills Practice' : 'Communication Skills Practice',
                    paymentDate: new Date(), // Will update on success
                    expiryDate: expiry,
                    attemptsLeft: 30
                },
                { upsert: true, new: true }
            );
        }
    } catch (dbError) {
        console.error("DB Save Failed:", dbError);
        // We continue to Payment even if DB save fails? 
        // Ideally NO, but for now we proceed to allow payment testing if DB is down.
    }

    // 4. Call Cashfree
    try {
        const response = await axios.post(
            'https://api.cashfree.com/pg/orders', // PRODUCTION URL
            {
                order_id: orderId,
                order_amount: orderAmount,
                order_currency: 'INR',
                customer_details: {
                    customer_id: customerId,
                    customer_name: customerName,
                    customer_email: customerEmail,
                    customer_phone: customerPhone
                },
                order_meta: {
                    return_url: returnUrl.replace('{order_id}', orderId)
                }
            },
            {
                headers: {
                    'x-client-id': process.env.CASHFREE_APP_ID,
                    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                    'x-api-version': '2022-09-01'
                }
            }
        );

        return res.status(200).json(response.data);

    } catch (error) {
        console.error('Cashfree Error:', error.response?.data || error.message);
        return res.status(500).json({ error: error.message });
    }
}
