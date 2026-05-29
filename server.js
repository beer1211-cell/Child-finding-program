const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const VIP_FEE = process.env.VIP_FEE || '1';
const PROMPTPAY_ID = process.env.PROMPTPAY_ID || '0812345678';

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer for file uploads (Profile photos & Payment Slips)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware to verify Admin Password
const verifyAdmin = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid admin password' });
  }
};

// Stable offset generator to fuzz coordinates based on User ID (for privacy)
function getStableOffset(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const latOffset = ((Math.abs(hash) % 100) / 100 - 0.5) * 0.005;
  const lngOffset = ((Math.abs(hash >> 8) % 100) / 100 - 0.5) * 0.005;
  return { latOffset, lngOffset };
}

// -------------------------------------------------------------
// SYSTEM CONFIG API
// -------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    vipFee: parseFloat(VIP_FEE),
    promptPayId: PROMPTPAY_ID
  });
});

// -------------------------------------------------------------
// CUSTOMER AUTH & UTILS
// -------------------------------------------------------------

// Customer Registration
app.post('/api/customer/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const existing = await db.findCustomer(username);
  if (existing) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' });
  }

  const newCustomer = await db.addCustomer(username, password);
  res.status(201).json({ 
    success: true, 
    message: 'สมัครสมาชิกเสร็จสิ้น! กรุณาเข้าสู่ระบบเพื่อใช้งาน',
    customerId: newCustomer.id 
  });
});

// Customer Login
app.post('/api/customer/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const customer = await db.findCustomer(username);
  if (!customer || customer.password !== password) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  res.json({ 
    success: true, 
    customerId: customer.id,
    username: customer.username,
    isVip: customer.isVip
  });
});

// Get Current Customer status
app.get('/api/customer/status', async (req, res) => {
  const customerId = req.headers['x-customer-id'];
  if (!customerId) {
    return res.json({ isLoggedIn: false, isVip: false });
  }

  const customer = await db.findCustomerById(customerId);
  if (!customer) {
    return res.json({ isLoggedIn: false, isVip: false });
  }

  // Find if customer has any pending payments
  const payments = await db.getPayments();
  const activePayment = payments.find(p => p.customerId === customerId && p.status === 'pending');

  res.json({
    isLoggedIn: true,
    customerId: customer.id,
    username: customer.username,
    isVip: customer.isVip,
    hasPendingPayment: !!activePayment
  });
});

// Customer Upload Slip
app.post('/api/customer/upload-slip', upload.single('slip'), async (req, res) => {
  try {
    const customerId = req.headers['x-customer-id'];
    if (!customerId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนแจ้งโอนเงิน' });
    }

    const customer = await db.findCustomerById(customerId);
    if (!customer) {
      return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้งานในระบบ' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาแนบรูปภาพสลิปโอนเงิน' });
    }

    const slipPath = `/uploads/${req.file.filename}`;
    await db.addPayment(customerId, slipPath, VIP_FEE);

    res.json({ 
      success: true, 
      message: 'ส่งสลิปแจ้งโอนเงินสำเร็จแล้ว! แอดมินกำลังตรวจสอบความถูกต้องสลิปของท่าน' 
    });
  } catch (error) {
    console.error('Slip upload error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งสลิป' });
  }
});

// -------------------------------------------------------------
// PUBLIC PROVIDER API (WITH VIP LIMITATIONS)
// -------------------------------------------------------------

// Get all verified providers (fuzzed/blurred based on VIP status)
app.get('/api/users', async (req, res) => {
  const users = await db.getUsers();
  const customerId = req.headers['x-customer-id'];
  
  let isVip = false;
  if (customerId) {
    const customer = await db.findCustomerById(customerId);
    if (customer && customer.isVip) {
      isVip = true;
    }
  }
  
  const verifiedUsers = users.filter(user => user.isVerified === true);
  
  if (isVip) {
    // VIP gets clean detailed profiles with stable fuzzed locations
    const publicUsers = verifiedUsers.map(user => {
      const { latOffset, lngOffset } = getStableOffset(user.id);
      return {
        id: user.id,
        name: user.name,
        price: user.price,
        lat: user.lat + latOffset,
        lng: user.lng + lngOffset,
        status: user.status,
        photo: user.photo,
        bio: user.bio,
        bookingsCount: user.bookingsCount || 0,
        isVip: true
      };
    });
    res.json(publicUsers);
  } else {
    // Normal visitors get blurred/hidden details
    const blurredUsers = verifiedUsers.map(user => {
      return {
        id: user.id,
        name: 'น้อง XXX (เฉพาะ VIP)',
        price: '???',
        lat: null, // No location pins
        lng: null,
        status: user.status,
        photo: '/uploads/default-avatar.png',
        bio: '🔒 ซ่อนข้อมูลส่วนตัวเฉพาะสมาชิก VIP เท่านั้น',
        bookingsCount: user.bookingsCount || 0,
        isVip: false
      };
    });
    res.json(blurredUsers);
  }
});

// Register new Dating Provider profile
app.post('/api/users/register', upload.single('photo'), async (req, res) => {
  try {
    const { name, price, lat, lng, lineId, phone, bio, objectPosition } = req.body;
    
    if (!name || !price || !lat || !lng) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ เรทราคา และปักหมุดตำแหน่งพิกัด' });
    }
    
    let photoPath = '/uploads/default-avatar.png';
    if (req.file) {
      photoPath = `/uploads/${req.file.filename}`;
    }
    
    const newUser = await db.addUser({
      name,
      price,
      lat,
      lng,
      lineId,
      phone,
      bio,
      photo: photoPath,
      status: 'available',
      objectPosition: objectPosition || 'center'
    });
    
    res.status(201).json({ 
      success: true, 
      message: 'ส่งใบสมัครเสร็จสิ้น! โปรดรอแอดมินยืนยันข้อมูล', 
      user: { id: newUser.id, name: newUser.name }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งใบสมัคร' });
  }
});

// Book/Contact (VIP ONLY)
app.post('/api/users/book', async (req, res) => {
  const { userId } = req.body;
  const customerId = req.headers['x-customer-id'];
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  
  if (!customerId) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบสมาชิกก่อนใช้บริการ' });
  }

  const customer = await db.findCustomerById(customerId);
  if (!customer || !customer.isVip) {
    return res.status(403).json({ error: 'เฉพาะสมาชิก VIP เท่านั้นที่สามารถดูช่องทางติดต่อและจองบริการได้' });
  }
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  const users = await db.getUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const success = await db.addBooking(userId, clientIp);
  
  if (success) {
    res.json({
      success: true,
      lineId: user.lineId,
      phone: user.phone,
      name: user.name
    });
  } else {
    res.status(500).json({ error: 'Failed to record booking' });
  }
});

// -------------------------------------------------------------
// ADMIN API ENDPOINTS (PASSWORD PROTECTED)
// -------------------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ success: false, error: 'รหัสผ่านแอดมินไม่ถูกต้อง' });
  }
});

app.get('/api/admin/users', verifyAdmin, async (req, res) => {
  res.json(await db.getUsers());
});

app.post('/api/admin/verify', verifyAdmin, async (req, res) => {
  const { id, isVerified } = req.body;
  if (!id) return res.status(400).json({ error: 'ID is required' });
  
  const updatedUser = await db.updateUserVerification(id, isVerified);
  if (updatedUser) {
    res.json({ success: true, user: updatedUser });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/admin/status', verifyAdmin, async (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'ID and Status are required' });
  
  const updatedUser = await db.updateUserStatus(id, status);
  if (updatedUser) {
    res.json({ success: true, user: updatedUser });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/admin/delete', verifyAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ID is required' });
  
  const success = await db.deleteUser(id);
  if (success) {
    res.json({ success: true, message: 'ลบโปรไฟล์สำเร็จ' });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Edit user profile details
app.post('/api/admin/users/edit', verifyAdmin, upload.single('photo'), async (req, res) => {
  const { id, name, price, lineId, phone, bio, lat, lng, status, objectPosition } = req.body;
  if (!id) return res.status(400).json({ error: 'ID is required' });
  
  const updateFields = {
    name,
    price,
    lineId,
    phone,
    bio,
    lat,
    lng,
    status,
    objectPosition
  };

  // If a new photo is uploaded, update its file path
  if (req.file) {
    updateFields.photo = `/uploads/${req.file.filename}`;
  }
  
  const updatedUser = await db.updateUser(id, updateFields);
  
  if (updatedUser) {
    res.json({ success: true, user: updatedUser });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});


// Get all uploaded payments
app.get('/api/admin/payments', verifyAdmin, async (req, res) => {
  const payments = await db.getPayments();
  const customers = await db.getCustomers();
  
  // Join payments with customer username details
  const joined = payments.map(pay => {
    const cust = customers.find(c => c.id === pay.customerId) || {};
    return {
      ...pay,
      username: cust.username || 'Unknown Customer'
    };
  });
  
  res.json(joined);
});

// Approve/Reject payment slip
app.post('/api/admin/payments/action', verifyAdmin, async (req, res) => {
  const { paymentId, status } = req.body; // status: approved or rejected
  if (!paymentId || !status) {
    return res.status(400).json({ error: 'Payment ID and Status are required' });
  }

  const updatedPay = await db.updatePaymentStatus(paymentId, status);
  if (updatedPay) {
    res.json({ success: true, payment: updatedPay });
  } else {
    res.status(404).json({ error: 'Payment record not found' });
  }
});

// Start Server
db.reinitSheets().then(() => {
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`SweetMap is running on: http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
    console.log(`=================================================`);
  });
});
