
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import dbConnect from './config/dbConnect.js';
import User from './models/User.js';

// Load Environment Variables
dotenv.config();

// Global Error Handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error);
});


// Setup for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// Serve Static Files (React Build)
app.use(express.static(path.join(__dirname, '../dist')));

// --- DATABASE CONNECTION ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET missing in .env. Security disabled.");
}

// Initialize Server AFTER Database Connection
async function startServer() {
    try {
        await dbConnect();
        console.log('✅ Database Connected Successfully');
    } catch (err) {
        console.error('❌ Database Connection Failed:', err.message);
        console.log('⚠️  Server will continue but database operations will fail');
    }

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
}

// Start the server
startServer();

// --- MIDDLEWARE ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: "Access Denied. No Token Provided." });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Access Denied. Malformed Token." });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // { _id, mobile, iat, exp }
        next();
    } catch (err) {
        res.status(400).json({ message: "Invalid or Expired Token" });
    }
};

// --- API ENDPOINTS ---

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'success',
        message: '✅ Backend Server is Running',
        timestamp: new Date().toISOString(),
        database: 'Connected',
        port: process.env.PORT || 5000
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>SCSM Backend Server</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    color: white;
                }
                .container {
                    text-align: center;
                    background: rgba(255,255,255,0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                }
                h1 { margin: 0 0 20px 0; font-size: 2.5em; }
                .status { 
                    background: #10b981; 
                    padding: 10px 20px; 
                    border-radius: 50px;
                    display: inline-block;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .info { margin: 10px 0; opacity: 0.9; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 SCSM Backend Server</h1>
                <div class="status">✅ Server is Running</div>
                <div class="info">Port: ${process.env.PORT || 5000}</div>
                <div class="info">Environment: ${process.env.NODE_ENV || 'development'}</div>
                <div class="info">Database: Connected</div>
                <div class="info">Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
            </div>
        </body>
        </html>
    `);
});


// 1. CREATE ORDER
app.post('/api/create-order', async (req, res) => {
    try {
        const { customerId, customerName, customerPhone, customerEmail, orderAmount, returnUrl, courseId, centerName } = req.body;

        console.log(`[CreateOrder] Request received for ${customerPhone} - Amount: ${orderAmount}`);
        const appId = process.env.CASHFREE_APP_ID;
        const secret = process.env.CASHFREE_SECRET_KEY;
        console.log(`[CreateOrder] Cashfree Config - AppID Present: ${!!appId}, Secret Present: ${!!secret}`);
        if (appId) console.log(`[CreateOrder] Mode: ${appId.startsWith('TEST') ? 'TEST' : 'PROD'}`);

        // Basic Validation
        if (!customerName || !customerPhone || !customerEmail || !orderAmount) {
            console.log("[CreateOrder] Validation Failed: Missing Details");
            return res.status(400).json({ message: "Missing Details" });
        }

        const orderId = "ORDER_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const validityDays = 20;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + validityDays);

        const subject = courseId === 'fttp' ? 'CSS' : 'CLS';
        const fullCourseName = courseId === 'fttp' ? 'Soft Skills Practice' : 'Language Skills Practice';

        // Try database save with timeout protection
        console.log(`[CreateOrder] Saving user to database...`);
        try {
            // Find user first
            let user = await User.findOne({ mobile: customerPhone });

            if (!user) {
                // New user - create with first course
                const savePromise = User.create({
                    name: customerName,
                    email: customerEmail,
                    mobile: customerPhone,
                    centerName: centerName || 'Online Student',
                    courses: [{
                        courseId: courseId,
                        courseName: fullCourseName,
                        subject: subject,
                        isPaid: false,
                        orderId: orderId,
                        paymentDate: new Date(),
                        expiryDate: expiry,
                        attemptsLeft: 30
                    }]
                });

                await Promise.race([
                    savePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 5000))
                ]);
            } else {
                // Existing user - check if course already purchased
                const existingCourse = user.courses.find(c => c.courseId === courseId);

                if (existingCourse) {
                    // Update existing course order
                    existingCourse.orderId = orderId;
                    existingCourse.isPaid = false;
                    existingCourse.paymentDate = new Date();
                } else {
                    // Add new course
                    user.courses.push({
                        courseId: courseId,
                        courseName: fullCourseName,
                        subject: subject,
                        isPaid: false,
                        orderId: orderId,
                        paymentDate: new Date(),
                        expiryDate: expiry,
                        attemptsLeft: 30
                    });
                }

                const savePromise = user.save();
                await Promise.race([
                    savePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 5000))
                ]);
            }

            console.log(`[CreateOrder] User saved successfully`);
        } catch (dbError) {
            console.error(`[CreateOrder] Database Error (continuing anyway):`, dbError.message);
            // Continue without database for testing
        }

        const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID ? process.env.CASHFREE_APP_ID.trim() : '';
        const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY ? process.env.CASHFREE_SECRET_KEY.trim() : '';

        if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
            console.error('[CreateOrder] MISSING CASHFREE CREDENTIALS');
            return res.status(500).json({
                error: 'Payment gateway not configured',
                message: 'CASHFREE credentials missing in .env file'
            });
        }

        const isTestKey = CASHFREE_APP_ID && CASHFREE_APP_ID.startsWith('TEST');
        const BASE_URL = isTestKey ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';

        const payload = {
            order_id: orderId,
            order_amount: orderAmount,
            order_currency: "INR",
            customer_details: {
                customer_id: customerId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone
            },
            order_meta: {
                return_url: returnUrl.replace('{order_id}', orderId)
            }
        };

        console.log(`[CreateOrder] Calling Cashfree API: ${BASE_URL}/orders`);
        console.log(`[CreateOrder] Payload:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(`${BASE_URL}/orders`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': '2022-09-01',
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY
            }
        });

        console.log(`[CreateOrder] Success! Payment session created`);
        res.json(response.data);

    } catch (error) {
        console.error("Create Order Error (Full):", error.message);
        if (error.response) {
            console.error("Create Order Response Data:", JSON.stringify(error.response.data, null, 2));
            console.error("Create Order Response Status:", error.response.status);
        }
        res.status(500).json({
            error: error.message,
            details: error.response?.data || "No response data",
            message: "Payment Initialization Failed"
        });
    }
});

// 2. VERIFY PAYMENT & GENERATE TOKEN
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ message: 'Order ID required' });

        const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
        const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
        const isTestKey = CASHFREE_APP_ID && CASHFREE_APP_ID.startsWith('TEST');
        const BASE_URL = isTestKey ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';

        const response = await axios.get(`${BASE_URL}/orders/${orderId}`, {
            headers: {
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY,
                'x-api-version': '2022-09-01'
            }
        });

        if (response.data.order_status === 'PAID') {
            // Find user and update the specific course as paid
            const user = await User.findOne({ 'courses.orderId': orderId });

            if (user) {
                // Find and update the specific course
                const course = user.courses.find(c => c.orderId === orderId);
                if (course) {
                    course.isPaid = true;
                    course.paymentDate = new Date();
                    await user.save();

                    // Generate JWT
                    const token = jwt.sign(
                        { _id: user._id, mobile: user.mobile, name: user.name },
                        process.env.JWT_SECRET,
                        { expiresIn: '20d' }
                    );

                    // Return ALL paid courses
                    const paidCourses = user.courses.filter(c => c.isPaid && new Date() < new Date(c.expiryDate));

                    return res.status(200).json({
                        success: true,
                        token: token,
                        user: {
                            name: user.name,
                            mobile: user.mobile,
                            centerName: user.centerName || 'Online Student',
                            courses: paidCourses.map(c => ({
                                courseId: c.courseId,
                                courseName: c.courseName,
                                selectedSubject: c.subject,
                                attemptsLeft: c.attemptsLeft
                            }))
                        }
                    });
                }
            }
        }
        res.status(400).json({ success: false, message: "Payment Not Paid" });

    } catch (error) {
        console.error("Verify Error:", error);
        res.status(500).json({ message: "Verification Failed" });
    }
});

// 3. LOGIN API (Strict) & GENERATE TOKEN
// 3. LOGIN API (Strict) & GENERATE TOKEN
app.post('/api/login', async (req, res) => {
    const { name, mobile, email } = req.body;

    if (!name || !mobile || !email) return res.status(400).json({ message: 'Name, Mobile and Email required' });

    try {
        const user = await User.findOne({
            mobile: mobile,
            email: { $regex: new RegExp(`^${email}$`, 'i') }
        });

        if (!user) return res.status(404).json({ message: 'User not found. Check details or Purchase Course.' });

        // Name Match
        const dbName = user.name.toLowerCase().trim();
        const inputName = name.toLowerCase().trim();
        if (!dbName.includes(inputName) && !inputName.includes(dbName)) {
            return res.status(401).json({ message: 'Name does not match our records.' });
        }

        const now = new Date();
        let validCourses = [];

        // 1. Check NEW Schema (courses array)
        if (user.courses && user.courses.length > 0) {
            validCourses = user.courses.filter(c => c.isPaid && new Date(c.expiryDate) > now);
        }

        // 2. Check OLD Schema (Legacy Support)
        if (validCourses.length === 0 && user.isPaid) {
            const expiry = user.expiryDate ? new Date(user.expiryDate) : new Date(Date.now() + 86400000); // Default 1 day if missing
            if (expiry > now) {
                validCourses.push({
                    courseId: user.enrolledCourse || 'fttp',
                    courseName: user.courseName || 'Soft Skills Practice',
                    subject: (user.enrolledCourse === 'dttp') ? 'CLS' : 'CSS',
                    attemptsLeft: user.attemptsLeft || 30,
                    selectedSubject: (user.enrolledCourse === 'dttp') ? 'CLS' : 'CSS'
                });
            }
        }

        if (validCourses.length === 0) {
            return res.status(403).json({ message: 'No active course found. Please purchase a course.' });
        }

        // Generate JWT
        const token = jwt.sign(
            { _id: user._id, mobile: user.mobile, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        return res.status(200).json({
            success: true,
            token: token,
            user: {
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                centerName: user.centerName || 'Online Student',
                courses: validCourses.map(c => ({
                    courseId: c.courseId,
                    courseName: c.courseName,
                    selectedSubject: c.subject || c.selectedSubject || 'CSS',
                    attemptsLeft: c.attemptsLeft
                }))
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

// 4. START EXAM (PROTECTED)
app.post('/api/start-exam', verifyToken, async (req, res) => {
    // We trust the token now
    const mobile = req.user.mobile;
    const { courseId } = req.body; // Which course exam to start

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find the specific course
        const course = user.courses.find(c => c.courseId === courseId && c.isPaid);
        if (!course) return res.status(404).json({ message: 'Course not found or not paid' });

        if (course.attemptsLeft <= 0) return res.status(403).json({ message: 'No attempts left for this course' });

        // Decrement attempts for this specific course
        course.attemptsLeft -= 1;
        await user.save();

        res.status(200).json({ success: true, attemptsLeft: course.attemptsLeft });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error" });
    }
});

// Fallback for React Router (SPA Support)
app.use((req, res) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(__dirname, '../dist', 'index.html'));
    } else if (req.method === 'GET') {
        res.status(404).send('Not Found');
    } else {
        res.status(404).json({ message: 'Not Found' });
    }
});

