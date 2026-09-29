const express = require('express');
const cors = require('cors');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Frontend UI එක පෙන්වීම
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const BOT_NAME = "MR GAVEE MINI BOT";
const PREFIX = '.';

let sock = null;
let isConnected = false;

async function startBot() {
    // Session directory
    if (!fs.existsSync('./session')) {
        fs.mkdirSync('./session');
    }

    const { state, saveCreds } = await useMultiFileAuthState('session');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '110.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                startBot();
            } else {
                isConnected = false;
                fs.rmSync('./session', { recursive: true, force: true });
                startBot();
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log('⚡ Bot is Online & Ready!');
            try {
                const jid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                await sock.sendMessage(jid, { 
                    text: `*⚡ ${BOT_NAME} IS ONLINE! ⚡*\n\nPairing සාර්ථකයි! දැන් ඔබට commands භාවිතා කළ හැක.\n\nType: *.menu*` 
                });
            } catch (e) {}
        }
    });

    // BOT COMMANDS
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || 
                     msg.message.videoMessage?.caption || '';

        if (!body.startsWith(PREFIX)) return;

        const args = body.slice(PREFIX.length).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();
        const text = args.join(' ');

        // 1. Menu
        if (cmd === 'menu') {
            const menuText = `*🎀 Ξ ${BOT_NAME} MENU Ξ* 🎀\n\n` +
                             `╭──────────●●►\n` +
                             `│ヤ *.tt* \n` +
                             `│ヤ *.mediafire* \n` +
                             `│ヤ *.ytsmovie* \n` +
                             `│ヤ *.ping*\n` +
                             `╰──────────●●►\n\n` +
                             `_Status: Online & Ready!_ ⚡`;
            return await sock.sendMessage(from, { text: menuText }, { quoted: msg });
        }

        // 2. Ping
        if (cmd === 'ping') {
            return await sock.sendMessage(from, { text: '⚡ Pong! Active and running fast!' }, { quoted: msg });
        }

        // 3. TikTok Downloader
        if (cmd === 'tt' || cmd === 'tiktok') {
            if (!text) return await sock.sendMessage(from, { text: '⚠️ කරුණාකර TikTok Link එකක් ලබා දෙන්න!' }, { quoted: msg });
            await sock.sendMessage(from, { text: '⏳ TikTok වීඩියෝව බාගත කරමින් පවතී...' }, { quoted: msg });
            try {
                const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(text)}`);
                const videoUrl = res.data.video?.noWatermark || res.data.video?.watermark;
                if (videoUrl) {
                    await sock.sendMessage(from, { video: { url: videoUrl }, caption: '✅ TikTok Video Downloaded!' }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '❌ වීඩියෝව හමු නොවීය.' }, { quoted: msg });
                }
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ දෝෂයක්: ${e.message}` }, { quoted: msg });
            }
        }

        // 4. Mediafire Downloader
        if (cmd === 'mediafire') {
            if (!text) return await sock.sendMessage(from, { text: '⚠️ Mediafire Link එකක් ලබා දෙන්න!' }, { quoted: msg });
            try {
                const res = await axios.get(`https://api.agatz.xyz/api/mediafire?url=${encodeURIComponent(text)}`);
                const file = res.data.data[0];
                if (file && file.link) {
                    await sock.sendMessage(from, { 
                        document: { url: file.link }, 
                        fileName: file.nama, 
                        mimetype: 'application/octet-stream',
                        caption: `📁 Name: \({file.nama}\n📦 Size:\){file.size}` 
                    }, { quoted: msg });
                }
            } catch (e) {
                await sock.sendMessage(from, { text: '❌ Mediafire File එක ලබාගත නොහැකි විය.' }, { quoted: msg });
            }
        }

        // 5. YTS Movies Search
        if (cmd === 'ytsmovie' || cmd === 'yts') {
            if (!text) return await sock.sendMessage(from, { text: '⚠️ Movie නමක් ලබා දෙන්න!' }, { quoted: msg });
            try {
                const res = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(text)}`);
                const movies = res.data.data?.movies;
                if (!movies || movies.length === 0) return await sock.sendMessage(from, { text: '❌ චිත්‍රපට හමු නොවීය.' }, { quoted: msg });
                let out = `🎬 *YTS MOVIE RESULTS* 🎬\n\n`;
                movies.slice(0, 3).forEach((m, i) => {
                    out += `*\({i+1}.\){m.title} (\({m.year})*\n⭐ Rating:\){m.rating}\n`;
                    m.torrents.forEach(t => {
                        out += ` • \({t.quality}: magnet:?xt=urn:btih:\){t.hash}&dn=${encodeURIComponent(m.title)}\n`;
                    });
                    out += `\n`;
                });
                await sock.sendMessage(from, { text: out }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ දෝෂයක්: ${e.message}` }, { quoted: msg });
            }
        }
    });
}

startBot();

// API Endpoints for Frontend UI
app.get('/api/pair', async (req, res) => {
    const phone = req.query.phone ? req.query.phone.replace(/[^0-9]/g, '') : '';
    if (!phone) return res.status(400).json({ error: 'Valid phone number required' });
    try {
        if (!sock) await startBot();
        const code = await sock.requestPairingCode(phone);
        res.json({ code: code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
