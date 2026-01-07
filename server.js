
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
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: "Access Denied. No Token Provided." });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Access Denied. Malformed Token." });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // { _id, mobile, iat, exp }

        // Single Device Check
        const user = await User.findById(req.user._id);
        if (!user) return res.status(401).json({ message: "User not found." });

        if (user.sessionToken !== token) {
            return res.status(401).json({ message: "Logged in on another device. Please login again." });
        }

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

        console.log(`[CreateOrder] Request received for ${customerPhone} - Course: ${courseId} - Amount: ${orderAmount}`);
        const appId = process.env.CASHFREE_APP_ID;
        const secret = process.env.CASHFREE_SECRET_KEY;

        // Basic Validation
        if (!customerName || !customerPhone || !customerEmail || !orderAmount) {
            return res.status(400).json({ message: "Missing Details" });
        }

        const orderId = "ORDER_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const validityDays = 20;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + validityDays);

        // Define courses to process based on input ID
        let coursesToProcess = [];

        if (courseId === 'soft-lang-combo') {
            // MERGED COURSE LOGIC: Add both courses under one order
            coursesToProcess = [
                { id: 'fttp', name: 'Soft Skills Practice', subject: 'CSS' },
                { id: 'dttp', name: 'Language Skills Practice', subject: 'CLS' }
            ];
        } else {
            // Standard Single Course
            const subject = courseId === 'fttp' ? 'CSS' : (courseId === 'dttp' ? 'CLS' : 'OTHER');
            const fullCourseName = courseId === 'fttp' ? 'Soft Skills Practice' : (courseId === 'dttp' ? 'Language Skills Practice' : courseId);
            coursesToProcess = [
                { id: courseId, name: fullCourseName, subject: subject }
            ];
        }

        // Database Operations
        console.log(`[CreateOrder] Saving user to database...`);
        try {
            let user = await User.findOne({ mobile: customerPhone });

            if (!user) {
                // New User
                const initialCourses = coursesToProcess.map(c => ({
                    courseId: c.id,
                    courseName: c.name,
                    subject: c.subject,
                    isPaid: false,
                    orderId: orderId, // SAME Order ID for all
                    paymentDate: new Date(),
                    expiryDate: expiry,
                    attemptsLeft: 30
                }));

                await User.create({
                    name: customerName,
                    email: customerEmail,
                    mobile: customerPhone,
                    centerName: centerName || 'Online Student',
                    courses: initialCourses
                });
            } else {
                // Existing User - Update or Add courses
                if (!user.courses) {
                    user.courses = [];
                }

                for (const courseItem of coursesToProcess) {
                    const existingCourse = user.courses.find(c => c.courseId === courseItem.id);

                    if (existingCourse) {
                        existingCourse.orderId = orderId;
                        existingCourse.isPaid = false;
                        existingCourse.paymentDate = new Date();
                    } else {
                        user.courses.push({
                            courseId: courseItem.id,
                            courseName: courseItem.name,
                            subject: courseItem.subject,
                            isPaid: false,
                            orderId: orderId,
                            paymentDate: new Date(),
                            expiryDate: expiry,
                            attemptsLeft: 30
                        });
                    }
                }
                const savedUser = await user.save();
                console.log(`[CreateOrder] User updated successfully: ${savedUser._id}`);
            }
        } catch (dbError) {
            console.error(`[CreateOrder] Database Error:`, dbError.message);
        }

        // Cashfree Integration
        const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID ? process.env.CASHFREE_APP_ID.trim() : '';
        const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY ? process.env.CASHFREE_SECRET_KEY.trim() : '';

        if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const isTestKey = CASHFREE_APP_ID.startsWith('TEST');
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

        const response = await axios.post(`${BASE_URL}/orders`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': '2022-09-01',
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY
            }
        });

        res.json(response.data);

    } catch (error) {
        console.error("Create Order Error:", error.message);
        res.status(500).json({
            message: "Payment Initialization Failed",
            details: error.response?.data
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
            // Find user who has ANY course with this orderId
            const user = await User.findOne({ 'courses.orderId': orderId });

            if (user) {
                // Mark ALL courses with this Order ID as Paid
                // Important for the Combo Pack (2 courses, same Order ID)
                let updated = false;
                user.courses.forEach(c => {
                    if (c.orderId === orderId) {
                        c.isPaid = true;
                        c.paymentDate = new Date();
                        updated = true;
                    }
                });

                if (updated) {
                    await user.save();

                    // Generate JWT
                    const token = jwt.sign(
                        { _id: user._id, mobile: user.mobile, name: user.name },
                        process.env.JWT_SECRET,
                        { expiresIn: '20d' }
                    );

                    user.sessionToken = token;
                    await user.save();

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

        // 2. Check OLD Schema (Legacy Support) & Migrate if needed
        if ((!user.courses || user.courses.length === 0) && user.isPaid) {
            const expiry = user.expiryDate ? new Date(user.expiryDate) : new Date(Date.now() + 86400000); // Default 1 day if missing

            if (expiry > now) {
                console.log(`[Login] Migrating Legacy User: ${user.mobile} to new Course Format`);

                // Grant BOTH courses to legacy users (Auto-Upgrade to Combo)
                user.courses = [
                    {
                        courseId: 'fttp',
                        courseName: 'Soft Skills Practice',
                        subject: 'CSS',
                        isPaid: true,
                        orderId: 'LEGACY_MIGRATION',
                        paymentDate: new Date(),
                        expiryDate: expiry,
                        attemptsLeft: user.attemptsLeft || 30
                    },
                    {
                        courseId: 'dttp',
                        courseName: 'Language Skills Practice',
                        subject: 'CLS',
                        isPaid: true,
                        orderId: 'LEGACY_MIGRATION',
                        paymentDate: new Date(),
                        expiryDate: expiry,
                        attemptsLeft: user.attemptsLeft || 30
                    }
                ];

                // Save the migration permanently to DB
                await user.save();

                // Use these new courses for the response
                validCourses = user.courses.filter(c => c.isPaid && new Date(c.expiryDate) > now);
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

        // Save session token to DB checks
        user.sessionToken = token;
        await user.save();

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
