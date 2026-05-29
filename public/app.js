// API Base URL
const API_URL = '';

let allUsers = []; 
let mapInstance = null;
let mapMarkers = [];
let searchOriginMarker = null;
let searchOriginLatLng = null;
let currentCustomer = { isLoggedIn: false, isVip: false };
let allAdminUsersCached = [];

// Helper to inject customer session headers
function getHeaders(extraHeaders = {}) {
  const customerId = localStorage.getItem('customerId');
  const headers = { ...extraHeaders };
  if (customerId) {
    headers['x-customer-id'] = customerId;
  }
  return headers;
}

// -------------------------------------------------------------
// CUSTOMER AUTHENTICATION & NAVBAR CONTROL
// -------------------------------------------------------------

async function checkCustomerAuth() {
  try {
    const res = await fetch(`${API_URL}/api/customer/status`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error();
    currentCustomer = await res.json();
    
    updateNavbar();
    applyVipAccessBlocks();
  } catch (e) {
    console.error('Auth check error:', e);
  }
}

// Render appropriate links and buttons dynamically in header navbar
function updateNavbar() {
  const nav = document.getElementById('navbar-links');
  if (!nav) return;

  const currentPath = window.location.pathname;
  const isHome = currentPath.endsWith('index.html') || currentPath === '/';
  const isMap = currentPath.endsWith('map.html');
  const isRegister = currentPath.endsWith('register.html');
  const isAdmin = currentPath.endsWith('admin.html');
  const isLogin = currentPath.endsWith('login.html');
  const isPayment = currentPath.endsWith('payment.html');

  let navHTML = `
    <a href="index.html" class="${isHome ? 'active' : ''}"><i class="fa-solid fa-list-ul"></i> รายชื่อทั้งหมด</a>
    <a href="map.html" class="${isMap ? 'active' : ''}"><i class="fa-solid fa-map-location-dot"></i> ค้นหาบนแผนที่</a>
    <a href="register.html" class="btn-cta ${isRegister ? 'active' : ''}"><i class="fa-solid fa-user-plus"></i> สมัครสมาชิก</a>
  `;

  if (currentCustomer.isLoggedIn) {
    const vipBadge = currentCustomer.isVip 
      ? '<span style="color:#00e676; font-size:0.8rem; border:1px solid #00e676; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem;"><i class="fa-solid fa-gem"></i> VIP</span>'
      : '<span style="color:#ffea00; font-size:0.8rem; border:1px solid #ffea00; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem;">Normal</span>';
      
    navHTML += `
      <span style="font-weight:600; font-size:0.95rem; color:#fff; margin-left:1rem;">
        <i class="fa-solid fa-user"></i> ${escapeHTML(currentCustomer.username)} ${vipBadge}
      </span>
      ${!currentCustomer.isVip ? `<a href="payment.html" class="${isPayment ? 'active' : ''}" style="color:#ff2a74; font-weight:700;"><i class="fa-solid fa-gem"></i> สมัคร VIP</a>` : ''}
      <a href="#" onclick="logoutCustomer(event)" style="color:var(--text-secondary);"><i class="fa-solid fa-right-from-bracket"></i> ออกจากระบบ</a>
    `;
  } else {
    navHTML += `
      <a href="login.html" class="${isLogin ? 'active' : ''}"><i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบสมาชิก</a>
    `;
  }

  navHTML += `
    <a href="admin.html" class="${isAdmin ? 'active' : ''}"><i class="fa-solid fa-user-gear"></i> แอดมิน</a>
  `;

  nav.innerHTML = navHTML;
}

// Check and apply CSS/Layout blocks for VIP resources
function applyVipAccessBlocks() {
  // 1. Alert banner on Homepage
  const vipAlertBanner = document.getElementById('vip-alert-banner');
  if (vipAlertBanner) {
    if (currentCustomer.isLoggedIn && currentCustomer.isVip) {
      vipAlertBanner.style.display = 'none';
    } else {
      vipAlertBanner.style.display = 'block';
    }
  }

  // 2. Map page blockers
  const mapBlocker = document.getElementById('map-vip-blocker');
  const mapControls = document.getElementById('map-controls-bar');
  const mapWrapper = document.getElementById('map-wrapper-div');
  if (mapBlocker && mapControls && mapWrapper) {
    if (currentCustomer.isLoggedIn && currentCustomer.isVip) {
      mapBlocker.style.display = 'none';
      mapControls.style.display = 'flex';
      mapWrapper.style.display = 'block';
    } else {
      mapBlocker.style.display = 'block';
      mapControls.style.display = 'none';
      mapWrapper.style.display = 'none';
    }
  }
}

// Customer Register submission handler
async function handleCustomerRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm').value;

  if (password !== passwordConfirm) {
    alert('รหัสผ่านไม่ตรงกัน');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/customer/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    alert(data.message);
    
    // Auto login
    localStorage.setItem('customerId', data.customerId);
    window.location.href = 'index.html';
  } catch (error) {
    alert(error.message);
  }
}

// Customer Login submission handler
async function handleCustomerLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_URL}/api/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem('customerId', data.customerId);
    window.location.href = 'index.html';
  } catch (error) {
    alert(error.message);
  }
}

function logoutCustomer(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('customerId');
  window.location.href = 'index.html';
}

// -------------------------------------------------------------
// CATALOG & PUBLIC API
// -------------------------------------------------------------

// Load all verified profiles from API (handles VIP / Non-VIP filtering via headers)
async function loadProfiles() {
  const usersGrid = document.getElementById('users-grid');
  try {
    await checkCustomerAuth(); // Fetch latest auth state first
    
    const res = await fetch(`${API_URL}/api/users`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch profiles');
    allUsers = await res.json();
    renderProfiles(allUsers);
  } catch (error) {
    console.error('Error loading profiles:', error);
    if (usersGrid) {
      usersGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 3rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>เกิดข้อผิดพลาดในการโหลดข้อมูลกรุณาลองใหม่อีกครั้ง</p>
        </div>
      `;
    }
  }
}

// Render profiles onto index.html grid
function renderProfiles(users) {
  const usersGrid = document.getElementById('users-grid');
  if (!usersGrid) return;
  
  if (users.length === 0) {
    usersGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 3rem;">
        <i class="fa-solid fa-users-slash" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
        <p>ไม่พบรายชื่อสมาชิกที่ตรงกับเงื่อนไขการค้นหา</p>
      </div>
    `;
    return;
  }
  
  usersGrid.innerHTML = users.map(user => {
    const statusText = user.status === 'available' ? 'ว่าง' : 'ไม่ว่าง';
    const statusClass = user.status === 'available' ? 'status-available' : 'status-busy';
    
    // Blurring style
    const isVipCard = user.isVip;
    const cardImgStyle = isVipCard ? '' : 'filter: blur(8px) brightness(0.6); pointer-events: none;';
    const priceText = isVipCard ? `${parseFloat(user.price).toLocaleString()} ฿` : 'เฉพาะ VIP';
    
    const actionBtn = isVipCard 
      ? `<button class="btn-cta btn-sm" onclick="bookUser('${user.id}')"><i class="fa-solid fa-comment-dots"></i> จอง / ติดต่อ</button>`
      : `<a href="payment.html" class="btn-cta btn-sm" style="background:var(--primary-gradient);"><i class="fa-solid fa-gem"></i> ปลดล็อก VIP</a>`;
    
    return `
      <div class="user-card" id="card-${user.id}">
        <div class="card-img-container">
          <img src="${user.photo}" style="${cardImgStyle}" onerror="this.src='/uploads/default-avatar.png'" alt="${user.name}">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="card-body">
          <div class="card-header-info">
            <span class="user-name">${escapeHTML(user.name)}</span>
            <span class="user-price" style="color: ${isVipCard ? '#ff2a74' : 'var(--text-secondary)'}; font-size: ${isVipCard ? '1.2rem' : '0.95rem'}">${priceText}</span>
          </div>
          <p class="user-bio">${escapeHTML(user.bio || 'ไม่มีรายละเอียดเพิ่มเติม')}</p>
          <div class="card-footer-info">
            <span class="popularity-score">
              <i class="fa-solid fa-fire"></i> ความนิยม: ${user.bookingsCount || 0}
            </span>
            ${actionBtn}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Apply inputs and filters from filters bar
function applyFilters() {
  const nameQuery = document.getElementById('search-name').value.toLowerCase().trim();
  const priceInput = document.getElementById('filter-price').value;
  const maxPrice = priceInput ? parseFloat(priceInput) : Infinity;
  const statusQuery = document.getElementById('filter-status').value;
  
  const filtered = allUsers.filter(user => {
    // Normal visitors cannot filter by price because price is blocked (hidden as '???')
    const matchesName = user.name.toLowerCase().includes(nameQuery) || (user.bio && user.bio.toLowerCase().includes(nameQuery));
    const matchesPrice = !user.isVip || user.price <= maxPrice;
    const matchesStatus = statusQuery === 'all' || user.status === statusQuery;
    
    return matchesName && matchesPrice && matchesStatus;
  });
  
  renderProfiles(filtered);
}

// Trigger click event/booking interaction
async function bookUser(userId) {
  try {
    const res = await fetch(`${API_URL}/api/users/book`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to contact user');
    
    openModal(data);
    loadProfiles();
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
}

// Modal handling
function openModal(data) {
  const modal = document.getElementById('contact-modal');
  if (!modal) return;
  
  const userObj = allUsers.find(u => u.name === data.name) || {};
  document.getElementById('modal-avatar').src = userObj.photo || '/uploads/default-avatar.png';
  document.getElementById('modal-user-name').innerText = data.name;
  document.getElementById('modal-line').innerText = data.lineId || '-';
  document.getElementById('modal-phone').innerText = data.phone || '-';
  
  modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('contact-modal');
  if (modal) modal.classList.remove('open');
}

// -------------------------------------------------------------
// PAYMENT PAGE LOGIC
// -------------------------------------------------------------

async function initPaymentPage() {
  try {
    // Refresh authentication states
    await checkCustomerAuth();
    
    if (!currentCustomer.isLoggedIn) {
      alert('กรุณาเข้าสู่ระบบก่อนสมัครสมาชิก VIP');
      window.location.href = 'login.html';
      return;
    }

    const statusContainer = document.getElementById('payment-status-container');
    const qrSection = document.getElementById('payment-qr-sec');

    // 1. Fetch system pricing configuration
    const configRes = await fetch(`${API_URL}/api/config`);
    const configData = await configRes.json();

    document.getElementById('payment-amount').innerText = configData.vipFee;
    document.getElementById('promptpay-id').innerText = configData.promptPayId;
    
    // Dynamic scannable PromptPay QR generator
    const qrUrl = `https://promptpay.io/${configData.promptPayId}/${configData.vipFee}.png`;
    document.getElementById('qr-image').src = qrUrl;

    // 2. Adjust layouts based on VIP/Pending payments
    statusContainer.style.display = 'block';

    if (currentCustomer.isVip) {
      statusContainer.innerHTML = `
        <div class="status-banner status-approved">
          <i class="fa-solid fa-circle-check"></i> บัญชีของคุณมีสถานะเป็น VIP เรียบร้อยแล้ว! ปลดล็อกการเข้าถึงระบบทั้งหมดเรียบร้อย
        </div>
      `;
      qrSection.style.display = 'none';
    } else if (currentCustomer.hasPendingPayment) {
      statusContainer.innerHTML = `
        <div class="status-banner status-pending">
          <i class="fa-solid fa-clock"></i> ได้ส่งสลิปแจ้งชำระเงินเรียบร้อยแล้ว อยู่ระหว่างผู้ดูแลระบบตรวจสอบและอนุมัติสิทธิ์ VIP...
        </div>
      `;
      qrSection.style.display = 'none';
    } else {
      statusContainer.style.display = 'none';
      qrSection.style.display = 'block';
    }

  } catch (error) {
    console.error('Error loading payment configs:', error);
  }
}

// Handle slip upload submit
async function handleSlipSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    const res = await fetch(`${API_URL}/api/customer/upload-slip`, {
      method: 'POST',
      headers: getHeaders(), // includes x-customer-id
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload slip');

    alert(data.message);
    initPaymentPage(); // Reload interface status
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
}

// -------------------------------------------------------------
// MAP INTERACTIVITY
// -------------------------------------------------------------

function initRegisterMap() {
  const mapElement = document.getElementById('register-map');
  if (!mapElement) return;
  
  const defaultLatLng = [13.7563, 100.5018];
  const regMap = L.map('register-map').setView(defaultLatLng, 11);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(regMap);
  
  let currentMarker = null;
  
  document.getElementById('reg-lat').value = defaultLatLng[0];
  document.getElementById('reg-lng').value = defaultLatLng[1];
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      regMap.setView([userLat, userLng], 14);
      
      currentMarker = L.marker([userLat, userLng], { draggable: true }).addTo(regMap);
      document.getElementById('reg-lat').value = userLat.toFixed(6);
      document.getElementById('reg-lng').value = userLng.toFixed(6);
      
      currentMarker.on('dragend', function (event) {
        const marker = event.target;
        const position = marker.getLatLng();
        document.getElementById('reg-lat').value = position.lat.toFixed(6);
        document.getElementById('reg-lng').value = position.lng.toFixed(6);
      });
    });
  }

  regMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    document.getElementById('reg-lat').value = lat.toFixed(6);
    document.getElementById('reg-lng').value = lng.toFixed(6);
    
    if (currentMarker) {
      currentMarker.setLatLng(e.latlng);
    } else {
      currentMarker = L.marker(e.latlng, { draggable: true }).addTo(regMap);
      currentMarker.on('dragend', function (event) {
        const marker = event.target;
        const position = marker.getLatLng();
        document.getElementById('reg-lat').value = position.lat.toFixed(6);
        document.getElementById('reg-lng').value = position.lng.toFixed(6);
      });
    }
  });
}

async function initSearchMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;
  
  // Verify VIP auth access
  await checkCustomerAuth();
  if (!currentCustomer.isVip) return; // Exit if access blocked

  const defaultLatLng = L.latLng(13.7563, 100.5018); 
  mapInstance = L.map('map').setView(defaultLatLng, 10);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);
  
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: getHeaders()
    });
    allUsers = await res.json();
    renderMapMarkers();
  } catch (e) {
    console.error('Error fetching map users:', e);
  }
  
  document.getElementById('map-radius').addEventListener('change', renderMapMarkers);
  
  document.getElementById('btn-geolocation').addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        const userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
        setSearchOrigin(userLatLng, "ตำแหน่งปัจจุบันของคุณ");
      }, () => {
        alert("ไม่สามารถเข้าถึงพิกัดปัจจุบันของคุณได้ โปรดตรวจสอบสิทธิ์การใช้งาน GPS");
      });
    } else {
      alert("เบราว์เซอร์ของคุณไม่รองรับการทำงานระบบระบุพิกัด");
    }
  });
  
  mapInstance.on('click', function(e) {
    setSearchOrigin(e.latlng, "จุดค้นหาที่กดยกเลิก");
  });
}

function setSearchOrigin(latLng, title) {
  searchOriginLatLng = latLng;
  mapInstance.setView(latLng, 12);
  
  if (searchOriginMarker) {
    searchOriginMarker.setLatLng(latLng);
  } else {
    searchOriginMarker = L.circleMarker(latLng, {
      color: '#ff2a74',
      fillColor: '#ff2a74',
      fillOpacity: 0.8,
      radius: 10
    }).addTo(mapInstance);
  }
  searchOriginMarker.bindPopup(`<b>${title}</b>`).openPopup();
  
  document.getElementById('search-origin-text').innerHTML = `
    <i class="fa-solid fa-location-dot" style="color: var(--primary-glow);"></i> 
    ระยะคำนวณจากพิกัด: ${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}
  `;
  
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!mapInstance) return;
  
  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];
  
  const radiusKm = parseFloat(document.getElementById('map-radius').value);
  
  allUsers.forEach(user => {
    if (user.lat === null || user.lng === null) return; // Skip blurred coordinates
    
    const userLatLng = L.latLng(user.lat, user.lng);
    let distance = null;
    if (searchOriginLatLng) {
      distance = searchOriginLatLng.distanceTo(userLatLng) / 1000;
    }
    
    if (radiusKm !== 99999 && distance !== null && distance > radiusKm) {
      return; 
    }
    
    const statusColor = user.status === 'available' ? '#00e676' : '#ff1744';
    const marker = L.circleMarker(userLatLng, {
      color: statusColor,
      fillColor: statusColor,
      fillOpacity: 0.6,
      radius: 8,
      weight: 2
    }).addTo(mapInstance);
    
    const distanceText = distance !== null ? `<p style="margin-top:0.2rem; font-size:0.8rem; color:#888;"><i class="fa-solid fa-road"></i> ห่างจากคุณ: ${distance.toFixed(2)} กม.</p>` : '';
    
    const popupContent = `
      <div class="map-popup-card">
        <img class="map-popup-img" src="${user.photo}" onerror="this.src='/uploads/default-avatar.png'">
        <div class="map-popup-info">
          <h4>${escapeHTML(user.name)}</h4>
          <span>${parseFloat(user.price).toLocaleString()} ฿</span>
          ${distanceText}
          <button class="btn-cta btn-sm" onclick="bookUser('${user.id}')" style="margin-top:0.5rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            ติดต่อจอง
          </button>
        </div>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    mapMarkers.push(marker);
  });
}

// -------------------------------------------------------------
// ADMIN LOGIC (Ranking, Slips & Moderation)
// -------------------------------------------------------------

function initAdminDashboard() {
  const adminPassword = localStorage.getItem('adminPassword');
  
  if (adminPassword) {
    loadAdminData(adminPassword);
  } else {
    document.getElementById('admin-login-sec').style.display = 'block';
    document.getElementById('admin-dashboard-sec').style.display = 'none';
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById('admin-password').value;
  
  try {
    const res = await fetch(`${API_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    
    localStorage.setItem('adminPassword', password);
    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

function handleAdminLogout() {
  localStorage.removeItem('adminPassword');
  document.getElementById('admin-login-sec').style.display = 'block';
  document.getElementById('admin-dashboard-sec').style.display = 'none';
}

async function loadAdminData(password) {
  try {
    // 1. Fetch all users
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: { 'x-admin-password': password }
    });
    
    if (res.status === 401) {
      handleAdminLogout();
      throw new Error('Unauthorized Access. Logged out.');
    }
    
    if (!res.ok) throw new Error('Failed to load users');
    const users = await res.json();
    allAdminUsersCached = users; // Cache for edit modal
    
    // Hide login form, display dashboard
    document.getElementById('admin-login-sec').style.display = 'none';
    document.getElementById('admin-dashboard-sec').style.display = 'block';
    
    // Compute stats
    const totalUsers = users.length;
    const pendingUsers = users.filter(u => !u.isVerified).length;
    const totalBookings = users.reduce((acc, curr) => acc + (curr.bookingsCount || 0), 0);
    
    document.getElementById('stat-total-users').innerText = totalUsers;
    document.getElementById('stat-pending-users').innerText = pendingUsers;
    document.getElementById('stat-total-bookings').innerText = totalBookings;
    
    // Render Secret Rankings & Moderation lists
    const sortedByRank = [...users].sort((a, b) => (b.bookingsCount || 0) - (a.bookingsCount || 0));
    populateRankingTable(sortedByRank);
    populateUsersTable(users, password);
    
    // 2. Fetch all payment slips
    const payRes = await fetch(`${API_URL}/api/admin/payments`, {
      headers: { 'x-admin-password': password }
    });
    if (!payRes.ok) throw new Error('Failed to load payment slips');
    const payments = await payRes.json();
    
    populatePaymentsTable(payments, password);
    
  } catch (error) {
    console.error(error);
  }
}

function populateRankingTable(users) {
  const tbody = document.getElementById('ranking-table-body');
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary);">ไม่มีข้อมูลในระบบ</td></tr>`;
    return;
  }
  
  tbody.innerHTML = users.map((user, idx) => {
    const statusText = user.status === 'available' ? 'ว่าง' : 'ไม่ว่าง';
    const statusClass = user.status === 'available' ? 'status-available' : 'status-busy';
    const isVerifiedText = user.isVerified ? '<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> อนุมัติแล้ว</span>' : '<span style="color:var(--warning)"><i class="fa-solid fa-clock"></i> รอตรวจสอบ</span>';
    
    let rankBadge = `${idx + 1}`;
    if (idx === 0) rankBadge = `<span style="font-size:1.3rem; color:#ffea00;"><i class="fa-solid fa-crown"></i> 1</span>`;
    else if (idx === 1) rankBadge = `<span style="font-size:1.1rem; color:#e0e0e0;"><i class="fa-solid fa-medal"></i> 2</span>`;
    else if (idx === 2) rankBadge = `<span style="font-size:1.1rem; color:#cd7f32;"><i class="fa-solid fa-medal"></i> 3</span>`;
    
    return `
      <tr>
        <td style="text-align: center; font-weight: 700;">${rankBadge}</td>
        <td><img class="admin-avatar" src="${user.photo}" onerror="this.src='/uploads/default-avatar.png'"></td>
        <td>${escapeHTML(user.name)}</td>
        <td>${parseFloat(user.price).toLocaleString()} ฿</td>
        <td style="text-align: center; font-size:1.2rem; font-weight: 700; color:var(--primary-glow);">${user.bookingsCount || 0} ครั้ง</td>
        <td><span class="status-badge ${statusClass}" style="position:relative; top:0; right:0;">${statusText}</span></td>
        <td>${isVerifiedText}</td>
      </tr>
    `;
  }).join('');
}

function populateUsersTable(users, password) {
  const tbody = document.getElementById('users-table-body');
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-secondary);">ไม่มีข้อมูลในระบบ</td></tr>`;
    return;
  }
  
  tbody.innerHTML = users.map(user => {
    const isVerified = user.isVerified;
    
    return `
      <tr>
        <td><img class="admin-avatar" src="${user.photo}" onerror="this.src='/uploads/default-avatar.png'"></td>
        <td>
          <div style="font-weight:600;">${escapeHTML(user.name)}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">ID: ${user.id}</div>
        </td>
        <td>${parseFloat(user.price).toLocaleString()} ฿</td>
        <td style="font-family:monospace; font-size:0.85rem;">
          ${user.lat.toFixed(5)}, ${user.lng.toFixed(5)}
        </td>
        <td>
          <div style="font-size:0.85rem;"><i class="fa-brands fa-line" style="color:#06c755;"></i> ${escapeHTML(user.lineId)}</div>
          <div style="font-size:0.85rem;"><i class="fa-solid fa-phone" style="color:#2196f3;"></i> ${escapeHTML(user.phone || '-')}</div>
        </td>
        <td>
          <select onchange="adminChangeStatus('${user.id}', this)" style="padding: 0.3rem 0.5rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-glass); color:#fff; border-radius:5px;">
            <option value="available" ${user.status === 'available' ? 'selected' : ''}>ว่าง</option>
            <option value="busy" ${user.status === 'busy' ? 'selected' : ''}>ไม่ว่าง</option>
          </select>
        </td>
        <td>
          <button class="btn-sm ${isVerified ? 'btn-reject' : 'btn-approve'}" onclick="adminToggleVerify('${user.id}', ${isVerified})">
            ${isVerified ? '<i class="fa-solid fa-times"></i> ยกเลิกอนุมัติ' : '<i class="fa-solid fa-check"></i> อนุมัติโปรไฟล์'}
          </button>
        </td>
        <td style="text-align: center;">
          <div class="admin-actions" style="justify-content: center;">
            <button class="btn-sm btn-approve" onclick="adminOpenEditModal('${user.id}')" style="background:rgba(33, 150, 243, 0.15); color:#2196f3; border:1px solid rgba(33,150,243,0.3);">
              <i class="fa-solid fa-pen-to-square"></i> แก้ไข
            </button>
            <button class="btn-sm btn-delete" onclick="adminDeleteUser('${user.id}')">
              <i class="fa-solid fa-trash-can"></i> ลบ
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Populate the payment slips list in Admin panel
function populatePaymentsTable(payments, password) {
  const tbody = document.getElementById('payments-table-body');
  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">ไม่มีรายการแจ้งโอนเงิน</td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(pay => {
    let statusBadge = '';
    let actionButtons = '';

    if (pay.status === 'pending') {
      statusBadge = `<span style="color:var(--warning); border:1px solid var(--warning); padding:0.1rem 0.4rem; border-radius:4px; font-size:0.8rem;"><i class="fa-solid fa-clock"></i> รอดำเนินการ</span>`;
      actionButtons = `
        <button class="btn-sm btn-approve" onclick="adminHandleSlipAction('${pay.id}', 'approved')"><i class="fa-solid fa-check"></i> อนุมัติ VIP</button>
        <button class="btn-sm btn-reject" onclick="adminHandleSlipAction('${pay.id}', 'rejected')"><i class="fa-solid fa-times"></i> ปฏิเสธ</button>
      `;
    } else if (pay.status === 'approved') {
      statusBadge = `<span style="color:var(--success); border:1px solid var(--success); padding:0.1rem 0.4rem; border-radius:4px; font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> อนุมัติสำเร็จ</span>`;
      actionButtons = `<span style="color:var(--text-secondary); font-size:0.85rem;">อนุมัติเรียบร้อย</span>`;
    } else {
      statusBadge = `<span style="color:var(--danger); border:1px solid var(--danger); padding:0.1rem 0.4rem; border-radius:4px; font-size:0.8rem;"><i class="fa-solid fa-circle-xmark"></i> ปฏิเสธแล้ว</span>`;
      actionButtons = `<span style="color:var(--text-secondary); font-size:0.85rem;">ยกเลิกรายการแล้ว</span>`;
    }

    const dateFormatted = new Date(pay.createdAt).toLocaleString('th-TH');

    return `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHTML(pay.username)}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">ID: ${pay.customerId}</div>
        </td>
        <td>
          <a href="${pay.slipPhoto}" target="_blank">
            <img src="${pay.slipPhoto}" style="max-height:80px; max-width:120px; border-radius:6px; border:1px solid var(--border-glass); cursor:pointer;" alt="Slip photo">
          </a>
        </td>
        <td style="font-weight:700; color:var(--success);">${pay.amount.toLocaleString()} ฿</td>
        <td style="font-size:0.85rem; color:var(--text-secondary);">${dateFormatted}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center; display:flex; gap:0.5rem; justify-content:center; align-items:center; min-height:90px;">${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

// Approve / Reject a payment slip
async function adminHandleSlipAction(paymentId, status) {
  const password = localStorage.getItem('adminPassword');
  const actionText = status === 'approved' ? 'อนุมัติสิทธิ์ VIP' : 'ปฏิเสธหลักฐานสลิป';
  if (!confirm(`คุณต้องการทำการ "${actionText}" ใช่หรือไม่?`)) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/payments/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password
      },
      body: JSON.stringify({ paymentId, status })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed updating payment status');

    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

// Toggle dating provider verification status
async function adminToggleVerify(id, currentStatus) {
  const password = localStorage.getItem('adminPassword');
  try {
    const res = await fetch(`${API_URL}/api/admin/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-password': password
      },
      body: JSON.stringify({ id, isVerified: !currentStatus })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed updating verify status');
    }
    
    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

// Change dating provider active status
async function adminChangeStatus(id, selectElem) {
  const password = localStorage.getItem('adminPassword');
  const status = selectElem.value;
  try {
    const res = await fetch(`${API_URL}/api/admin/status`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-password': password
      },
      body: JSON.stringify({ id, status })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed updating status');
    }
    
    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

// Delete provider profile
async function adminDeleteUser(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบโปรไฟล์นี้อย่างถาวร?')) return;
  
  const password = localStorage.getItem('adminPassword');
  try {
    const res = await fetch(`${API_URL}/api/admin/delete`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-password': password
      },
      body: JSON.stringify({ id })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete profile');
    }
    
    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

// Open Edit profile Modal
function adminOpenEditModal(userId) {
  const user = allAdminUsersCached.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-name').value = user.name;
  document.getElementById('edit-price').value = user.price;
  document.getElementById('edit-status').value = user.status;
  document.getElementById('edit-bio').value = user.bio || '';
  document.getElementById('edit-line').value = user.lineId || '';
  document.getElementById('edit-phone').value = user.phone || '';
  document.getElementById('edit-lat').value = user.lat;
  document.getElementById('edit-lng').value = user.lng;

  // Set current avatar preview
  document.getElementById('edit-current-avatar').src = user.photo || '/uploads/default-avatar.png';
  
  // Reset new photo file input and its preview
  document.getElementById('edit-photo').value = '';
  document.getElementById('edit-photo-preview').style.display = 'none';
  document.getElementById('edit-photo-preview').src = '';

  const modal = document.getElementById('admin-edit-modal');
  if (modal) modal.classList.add('open');
}

function closeAdminEditModal() {
  const modal = document.getElementById('admin-edit-modal');
  if (modal) modal.classList.remove('open');
}

async function handleAdminEditSubmit(e) {
  e.preventDefault();
  const password = localStorage.getItem('adminPassword');
  const form = e.target;
  const formData = new FormData(form);

  try {
    const res = await fetch(`${API_URL}/api/admin/users/edit`, {
      method: 'POST',
      headers: {
        'x-admin-password': password
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');

    alert('แก้ไขข้อมูลสมาชิกเรียบร้อยแล้ว!');
    closeAdminEditModal();
    loadAdminData(password);
  } catch (error) {
    alert(error.message);
  }
}

// Helper to escape HTML tags to prevent XSS attacks
function escapeHTML(str) {

  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
