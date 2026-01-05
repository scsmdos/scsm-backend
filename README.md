# SCSM Backend Server

Express.js backend for SCSM Website with MongoDB, JWT Authentication, and Cashfree Payment Integration.

## Features
- ✅ JWT Authentication
- ✅ Cashfree Payment Gateway
- ✅ MongoDB Database
- ✅ CORS Enabled
- ✅ Health Check Endpoint

## Environment Variables
```env
PORT=5000
JWT_SECRET=your_secret_key
MONGODB_URI=your_mongodb_connection_string
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
```

## Installation
```bash
npm install
npm start
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Create Order
```
POST /api/create-order
```

### Verify Payment
```
POST /api/verify-payment
```

### Login
```
POST /api/login
```

### Start Exam (Protected)
```
POST /api/start-exam
Header: Authorization: Bearer <token>
```

## Deployment
Deployed on: Render.com
