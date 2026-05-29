const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./database');

const newMockUsers = [
  {
    "id": "usr_mock_mint",
    "name": "น้องมิ้นท์",
    "price": 1300,
    "lat": 13.7649,
    "lng": 100.5383,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "mint_chilla",
    "phone": "085-111-2222",
    "bio": "พิกัดอนุสาวรีย์ชัยฯ ว่างช่วงเย็นค่ะ รับงานกินข้าว ดูหนัง คุยเก่ง อารมณ์ดีทักได้เลยค่ะ",
    "isVerified": true,
    "bookingsCount": 11,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_bow",
    "name": "น้องโบว์",
    "price": 1600,
    "lat": 13.8034,
    "lng": 100.5532,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "bowie_sweet",
    "phone": "085-333-4444",
    "bio": "พิกัดจตุจักร/ห้าแยกลาดพร้าว เดินเล่นสวนจตุจักร คาเฟ่ ถ่ายรูปเก๋ๆ ยินดีที่ได้รู้จักทุกคนค่ะ",
    "isVerified": true,
    "bookingsCount": 18,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_ploy",
    "name": "น้องพลอย",
    "price": 1500,
    "lat": 13.6678,
    "lng": 100.6053,
    "status": "busy",
    "photo": "/uploads/default-avatar.png",
    "lineId": "ploy_gems",
    "phone": "085-555-6666",
    "bio": "อยู่แถวบางนา/แบริ่งค่ะ ชอบทานชาบูและของหวาน คุยสนุก ไม่เครียด ทักมาปรึกษาได้ทุกเรื่องน้า",
    "isVerified": true,
    "bookingsCount": 7,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_breeze",
    "name": "น้องบีซ",
    "price": 1400,
    "lat": 13.7279,
    "lng": 100.7782,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "breeze_wind",
    "phone": "085-777-8888",
    "bio": "แถวลาดกระบัง/สุวรรณภูมิค่ะ รับงานทานข้าว นั่งเล่น คุยปรึกษาปัญหาชีวิต เป็นผู้ฟังที่ดีค่ะ",
    "isVerified": true,
    "bookingsCount": 5,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_mook",
    "name": "น้องมุก",
    "price": 1700,
    "lat": 13.7269,
    "lng": 100.4923,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "mook_pearl",
    "phone": "085-999-0000",
    "bio": "ฝั่งธนฯ/วงเวียนใหญ่ ทานสตรีทฟู้ดอร่อยๆ เดินเที่ยวตลาดพลู คุยเก่ง ตลก ขี้อ้อนสุดๆ ทักเลยน้า",
    "isVerified": true,
    "bookingsCount": 21,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_gift",
    "name": "น้องกิ๊ฟ",
    "price": 1200,
    "lat": 13.7592,
    "lng": 100.6190,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "gift_present",
    "phone": "086-111-3333",
    "bio": "พิกัดรามคำแหง/บางกะปิค่ะ หาคนพาทานข้าวเย็น ดูหนังใหม่แกะกล่อง ไลฟ์สไตล์เรียบง่าย สบายๆ ค่ะ",
    "isVerified": true,
    "bookingsCount": 13,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_nan",
    "name": "น้องแนน",
    "price": 1900,
    "lat": 13.8591,
    "lng": 100.4914,
    "status": "busy",
    "photo": "/uploads/default-avatar.png",
    "lineId": "nan_cute",
    "phone": "086-222-4444",
    "bio": "นนทบุรี/สนามบินน้ำค่ะ ชอบถ่ายรูปคาเฟ่ชิคๆ เดินเล่นริมน้ำเจ้าพระยา ทักมาทายกันได้นะคะ",
    "isVerified": true,
    "bookingsCount": 4,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_june",
    "name": "น้องจูน",
    "price": 1100,
    "lat": 13.8138,
    "lng": 100.7202,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "june_summer",
    "phone": "086-333-5555",
    "bio": "พิกัดมีนบุรี/รามอินทราค่ะ เน้นคุยไลน์เป็นเพื่อน เล่นเกมมือถือ หาคนตี้คุยชิลๆ คุยสนุกแน่นอนค่ะ",
    "isVerified": true,
    "bookingsCount": 9,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_ping",
    "name": "น้องปิงปิง",
    "price": 2200,
    "lat": 13.7772,
    "lng": 100.4789,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "ping_premium",
    "phone": "086-444-6666",
    "bio": "พิกัดปิ่นเกล้า/ตลิ่งชันค่ะ รับเพื่อนดินเนอร์ร้านหรู ถ่ายรูปคุมโทน สไตล์มินิมอล สนใจทักมาเลยค่า",
    "isVerified": true,
    "bookingsCount": 26,
    "createdAt": new Date().toISOString()
  },
  {
    "id": "usr_mock_view",
    "name": "น้องวิว",
    "price": 1500,
    "lat": 13.7762,
    "lng": 100.5645,
    "status": "available",
    "photo": "/uploads/default-avatar.png",
    "lineId": "view_finder",
    "phone": "086-555-7777",
    "bio": "พิกัดดินแดง/ห้วยขวางค่ะ สะดวกเดินทางง่าย เดินเล่นห้างสรรพสินค้า คุยเก่ง ตอบเร็ว ยิ้มหวานค่ะ",
    "isVerified": true,
    "bookingsCount": 15,
    "createdAt": new Date().toISOString()
  }
];

async function seed() {
  console.log("=== STARTING DATABASE SEEDING PROCESS ===");
  try {
    // Wait for Sheets or local db to initialize
    await db.reinitSheets();
    
    console.log(`DB Mode: ${db.isUsingGoogleSheets() ? 'Google Sheets' : 'Local JSON'}`);
    
    const existingUsers = await db.getUsers();

    let addedCount = 0;
    for (const mockUser of newMockUsers) {
      const exists = existingUsers.some(u => u.name === mockUser.name);
      if (!exists) {
        // Add the user to the database
        const newUser = await db.addUser({
          name: mockUser.name,
          price: mockUser.price,
          lat: mockUser.lat,
          lng: mockUser.lng,
          status: mockUser.status,
          photo: mockUser.photo,
          lineId: mockUser.lineId,
          phone: mockUser.phone,
          bio: mockUser.bio
        });
        
        // Approve/verify the user profile
        await db.updateUserVerification(newUser.id, true);
        
        // Update extra details
        await db.updateUser(newUser.id, {
          bookingsCount: mockUser.bookingsCount
        });
        
        addedCount++;
        console.log(`✅ Seeded user: ${mockUser.name}`);
      } else {
        console.log(`⏭️ Skipped duplicate user: ${mockUser.name}`);
      }
    }
    
    console.log(`===============================================`);
    console.log(`Successfully completed database seeding!`);
    console.log(`Added ${addedCount} mock users.`);
    console.log(`===============================================`);
    process.exit(0);
  } catch (error) {
    console.error("Error during seeding process:", error);
    process.exit(1);
  }
}

seed();
