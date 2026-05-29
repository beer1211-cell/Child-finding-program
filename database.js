const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

// Sheets configuration headers mapping
const HEADERS = {
  Users: ['id', 'name', 'price', 'lat', 'lng', 'status', 'photo', 'lineId', 'phone', 'bio', 'isVerified', 'bookingsCount', 'createdAt', 'objectPosition'],
  Bookings: ['id', 'userId', 'timestamp', 'clientIp'],
  Customers: ['id', 'username', 'password', 'isVip', 'createdAt'],
  Payments: ['id', 'customerId', 'slipPhoto', 'amount', 'status', 'createdAt']
};

let useGoogleSheets = false;
let sheetsClient = null;
let driveClient = null;
let SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Ensure local fallback files exist
function initLocalDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf8');
  if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2), 'utf8');
  if (!fs.existsSync(CUSTOMERS_FILE)) fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify([], null, 2), 'utf8');
  if (!fs.existsSync(PAYMENTS_FILE)) fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([], null, 2), 'utf8');
  
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

// Local read/write JSON helpers
function readLocalData(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading local database:`, error);
    return [];
  }
}

function writeLocalData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing local database:`, error);
    return false;
  }
}

// Google Sheets API Helpers
async function initGoogleSheets() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  
  if (!fs.existsSync(credentialsPath)) {
    console.warn("⚠️ [SweetMap DB Alert]: 'credentials.json' not found. Falling back to local JSON database.");
    return;
  }
  
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'your_google_sheet_id_here') {
    console.warn("⚠️ [SweetMap DB Alert]: 'SPREADSHEET_ID' is not set in .env. Falling back to local JSON database.");
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });
    
    sheetsClient = google.sheets({ version: 'v4', auth });
    driveClient = google.drive({ version: 'v3', auth });
    
    // Test connection and auto-initialize headers
    for (const sheetName of Object.keys(HEADERS)) {
      try {
        const response = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A1:Z1`
        });
        
        const row = response.data.values;
        // If sheet has no headers, initialize them
        if (!row || row.length === 0) {
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [HEADERS[sheetName]] }
          });
          console.log(`✅ [Google Sheets]: Initialized headers for sheet '${sheetName}'`);
        }
      } catch (e) {
        // If sheet tab doesn't exist, log warning
        console.error(`❌ [Google Sheets]: Error accessing sheet tab '${sheetName}'. Make sure it exists!`, e.message);
        throw e;
      }
    }
    
    useGoogleSheets = true;
    console.log("🚀 [SweetMap DB]: Google Sheets API connected successfully!");
  } catch (error) {
    console.error("❌ [SweetMap DB]: Failed to connect to Google Sheets API:", error.message);
    console.warn("⚠️ [SweetMap DB]: Falling back to local JSON database.");
  }
}

// Convert sheet rows (2D array) to object array
function rowsToObjects(rows, headers) {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      let val = row[index];
      if (val === undefined || val === null) val = '';
      
      // Parse values according to type
      if (header === 'price' || header === 'lat' || header === 'lng' || header === 'bookingsCount' || header === 'amount') {
        obj[header] = parseFloat(val) || 0;
      } else if (header === 'isVerified' || header === 'isVip') {
        obj[header] = val === 'TRUE' || val === 'true' || val === '1' || val === true;
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

// Convert object to row values array
function objectToRow(obj, headers) {
  return headers.map(header => {
    let val = obj[header];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return String(val);
  });
}

// Sheets operations
async function getSheetsData(sheetName) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z`
  });
  return rowsToObjects(response.data.values || [], HEADERS[sheetName]);
}

async function appendSheetsData(sheetName, obj) {
  const row = objectToRow(obj, HEADERS[sheetName]);
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

async function updateSheetsRow(sheetName, id, obj) {
  // 1. Fetch all rows to find the index
  const items = await getSheetsData(sheetName);
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return null;
  
  const rowNumber = index + 2; // Row 1 is header, index is 0-based
  const row = objectToRow(obj, HEADERS[sheetName]);
  
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
  
  return obj;
}

async function deleteSheetsRow(sheetName, id) {
  // Google sheets doesn't support easy raw deletion without leaving empty cells or using batch update.
  // Instead, we fetch all, filter out the deleted ID, clear the sheet and rewrite all rows!
  // This is very clean and reliable for small-medium databases.
  const items = await getSheetsData(sheetName);
  const filtered = items.filter(item => item.id !== id);
  
  // Clear sheet content
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z`
  });
  
  if (filtered.length > 0) {
    const rows = filtered.map(item => objectToRow(item, HEADERS[sheetName]));
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
  }
  return true;
}

// Initialise Database Systems
initLocalDatabase();
initGoogleSheets();

module.exports = {
  // Check active DB mode
  isUsingGoogleSheets: () => useGoogleSheets,
  reinitSheets: async () => {
    await initGoogleSheets();
    return useGoogleSheets;
  },

  // Google Drive File Uploader
  uploadFile: async (fileObject) => {
    if (!fileObject) return null;

    const localPath = fileObject.path;
    const filename = fileObject.filename;
    const mimeType = fileObject.mimetype;
    const fallbackUrl = `/uploads/${filename}`;

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!useGoogleSheets || !driveClient || !folderId || folderId === 'your_folder_id_here') {
      return fallbackUrl;
    }

    try {
      // 1. Upload file to Google Drive
      const fileMetadata = {
        name: filename,
        parents: [folderId]
      };
      const media = {
        mimeType: mimeType,
        body: fs.createReadStream(localPath)
      };

      const response = await driveClient.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id'
      });

      const fileId = response.data.id;

      // 2. Make the file public (anyone can read)
      await driveClient.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      // 3. Remove the local temp file to save space
      try {
        fs.unlinkSync(localPath);
      } catch (err) {
        console.error("❌ [Google Drive]: Failed to delete local temp file:", err.message);
      }

      // 4. Return direct public web link for standard HTML <img> tags
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    } catch (error) {
      console.error("❌ [Google Drive]: Upload failed, falling back to local file path:", error.message);
      return fallbackUrl;
    }
  },

  // Users CRUD
  getUsers: async () => {
    if (useGoogleSheets) return await getSheetsData('Users');
    return readLocalData(USERS_FILE);
  },
  
  addUser: async (userData) => {
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: userData.name,
      price: parseFloat(userData.price) || 0,
      lat: parseFloat(userData.lat) || 13.7563,
      lng: parseFloat(userData.lng) || 100.5018,
      status: userData.status || 'available',
      photo: userData.photo || '/uploads/default-avatar.png',
      lineId: userData.lineId || '',
      phone: userData.phone || '',
      bio: userData.bio || '',
      isVerified: false,
      bookingsCount: 0,
      createdAt: new Date().toISOString(),
      objectPosition: userData.objectPosition || 'center'
    };
    
    if (useGoogleSheets) {
      await appendSheetsData('Users', newUser);
    } else {
      const users = readLocalData(USERS_FILE);
      users.push(newUser);
      writeLocalData(USERS_FILE, users);
    }
    return newUser;
  },
  
  updateUserVerification: async (id, isVerified) => {
    const users = useGoogleSheets ? await getSheetsData('Users') : readLocalData(USERS_FILE);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index].isVerified = isVerified;
      if (useGoogleSheets) {
        await updateSheetsRow('Users', id, users[index]);
      } else {
        writeLocalData(USERS_FILE, users);
      }
      return users[index];
    }
    return null;
  },

  updateUserStatus: async (id, status) => {
    const users = useGoogleSheets ? await getSheetsData('Users') : readLocalData(USERS_FILE);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index].status = status;
      if (useGoogleSheets) {
        await updateSheetsRow('Users', id, users[index]);
      } else {
        writeLocalData(USERS_FILE, users);
      }
      return users[index];
    }
    return null;
  },

  updateUser: async (id, updateData) => {
    const users = useGoogleSheets ? await getSheetsData('Users') : readLocalData(USERS_FILE);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = {
        ...users[index],
        name: updateData.name || users[index].name,
        price: updateData.price !== undefined ? parseFloat(updateData.price) : users[index].price,
        lineId: updateData.lineId !== undefined ? updateData.lineId : users[index].lineId,
        phone: updateData.phone !== undefined ? updateData.phone : users[index].phone,
        bio: updateData.bio !== undefined ? updateData.bio : users[index].bio,
        lat: updateData.lat !== undefined && !isNaN(parseFloat(updateData.lat)) ? parseFloat(updateData.lat) : users[index].lat,
        lng: updateData.lng !== undefined && !isNaN(parseFloat(updateData.lng)) ? parseFloat(updateData.lng) : users[index].lng,
        status: updateData.status || users[index].status,
        photo: updateData.photo !== undefined ? updateData.photo : users[index].photo,
        objectPosition: updateData.objectPosition !== undefined ? updateData.objectPosition : users[index].objectPosition
      };
      
      if (useGoogleSheets) {
        await updateSheetsRow('Users', id, users[index]);
      } else {
        writeLocalData(USERS_FILE, users);
      }
      return users[index];
    }
    return null;
  },
  
  deleteUser: async (id) => {
    if (useGoogleSheets) {
      await deleteSheetsRow('Users', id);
      await deleteSheetsRow('Bookings', id); // remove bookings belonging to user
      return true;
    } else {
      const users = readLocalData(USERS_FILE);
      const filtered = users.filter(u => u.id !== id);
      const result = writeLocalData(USERS_FILE, filtered);
      
      const bookings = readLocalData(BOOKINGS_FILE);
      const filteredBookings = bookings.filter(b => b.userId !== id);
      writeLocalData(BOOKINGS_FILE, filteredBookings);
      return result;
    }
  },
  
  // Bookings CRUD
  getBookings: async () => {
    if (useGoogleSheets) return await getSheetsData('Bookings');
    return readLocalData(BOOKINGS_FILE);
  },
  
  addBooking: async (userId, clientIp) => {
    const users = useGoogleSheets ? await getSheetsData('Users') : readLocalData(USERS_FILE);
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;
    
    users[userIndex].bookingsCount = (users[userIndex].bookingsCount || 0) + 1;
    
    if (useGoogleSheets) {
      await updateSheetsRow('Users', userId, users[userIndex]);
    } else {
      writeLocalData(USERS_FILE, users);
    }
    
    const newBooking = {
      id: 'bk_' + Math.random().toString(36).substr(2, 9),
      userId,
      timestamp: new Date().toISOString(),
      clientIp
    };
    
    if (useGoogleSheets) {
      await appendSheetsData('Bookings', newBooking);
    } else {
      const bookings = readLocalData(BOOKINGS_FILE);
      bookings.push(newBooking);
      writeLocalData(BOOKINGS_FILE, bookings);
    }
    
    return true;
  },

  // Customers CRUD
  getCustomers: async () => {
    if (useGoogleSheets) return await getSheetsData('Customers');
    return readLocalData(CUSTOMERS_FILE);
  },

  addCustomer: async (username, password) => {
    const newCustomer = {
      id: 'cust_' + Math.random().toString(36).substr(2, 9),
      username: username.trim(),
      password: password, 
      isVip: false,
      createdAt: new Date().toISOString()
    };
    
    if (useGoogleSheets) {
      await appendSheetsData('Customers', newCustomer);
    } else {
      const customers = readLocalData(CUSTOMERS_FILE);
      customers.push(newCustomer);
      writeLocalData(CUSTOMERS_FILE, customers);
    }
    return newCustomer;
  },

  findCustomer: async (username) => {
    const customers = useGoogleSheets ? await getSheetsData('Customers') : readLocalData(CUSTOMERS_FILE);
    return customers.find(c => c.username.toLowerCase() === username.toLowerCase().trim());
  },

  findCustomerById: async (id) => {
    const customers = useGoogleSheets ? await getSheetsData('Customers') : readLocalData(CUSTOMERS_FILE);
    return customers.find(c => c.id === id);
  },

  updateCustomerVipStatus: async (id, isVip) => {
    const customers = useGoogleSheets ? await getSheetsData('Customers') : readLocalData(CUSTOMERS_FILE);
    const index = customers.findIndex(c => c.id === id);
    if (index !== -1) {
      customers[index].isVip = isVip;
      if (useGoogleSheets) {
        await updateSheetsRow('Customers', id, customers[index]);
      } else {
        writeLocalData(CUSTOMERS_FILE, customers);
      }
      return customers[index];
    }
    return null;
  },

  // Payments CRUD
  getPayments: async () => {
    if (useGoogleSheets) return await getSheetsData('Payments');
    return readLocalData(PAYMENTS_FILE);
  },

  addPayment: async (customerId, slipPhoto, amount) => {
    const newPayment = {
      id: 'pay_' + Math.random().toString(36).substr(2, 9),
      customerId,
      slipPhoto,
      amount: parseFloat(amount) || 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    if (useGoogleSheets) {
      await appendSheetsData('Payments', newPayment);
    } else {
      const payments = readLocalData(PAYMENTS_FILE);
      payments.push(newPayment);
      writeLocalData(PAYMENTS_FILE, payments);
    }
    return newPayment;
  },

  updatePaymentStatus: async (paymentId, status) => {
    const payments = useGoogleSheets ? await getSheetsData('Payments') : readLocalData(PAYMENTS_FILE);
    const index = payments.findIndex(p => p.id === paymentId);
    if (index === -1) return null;

    payments[index].status = status;
    
    if (useGoogleSheets) {
      await updateSheetsRow('Payments', paymentId, payments[index]);
    } else {
      writeLocalData(PAYMENTS_FILE, payments);
    }

    if (status === 'approved') {
      const customerId = payments[index].customerId;
      const customers = useGoogleSheets ? await getSheetsData('Customers') : readLocalData(CUSTOMERS_FILE);
      const custIndex = customers.findIndex(c => c.id === customerId);
      if (custIndex !== -1) {
        customers[custIndex].isVip = true;
        if (useGoogleSheets) {
          await updateSheetsRow('Customers', customerId, customers[custIndex]);
        } else {
          writeLocalData(CUSTOMERS_FILE, customers);
        }
      }
    }
    return payments[index];
  }
};
