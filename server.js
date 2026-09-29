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

// Serve Static Frontend UI
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const BOT_NAME = 'MR GAVEE MINI BOT';
const PREFIX = '.';

let sock = null;
let isConnected = false;

// Serve pairing index.html on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

async function startBot() {
    if (!fs.existsSync('./session')) {
        fs.mkdirSync('./session');
    }

    const { state, saveCreds } = await useMultiFileAuthState('session');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            isConnected = false;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log('WhatsApp Bot successfully connected!');
        }
    });

    // Simple Command Handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || '';

        if (!body.startsWith(PREFIX)) return;

        const args = body.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const text = args.join(' ');

        try {
            if (command === 'alive' || command === 'ping') {
                await sock.sendMessage(from, { 
                    text: `*\({BOT_NAME} is Online!* ⚡\n\nPrefix:\){PREFIX}\nStatus: Active 24/7` 
                }, { quoted: msg });
            } 
            else if (command === 'movie' || command === 'yts') {
                if (!text) {
                    return await sock.sendMessage(from, { text: `Please provide a movie name! Example: ${PREFIX}movie Inception` }, { quoted: msg });
                }
                const res = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(text)}`);
                const movies = res.data.data.movies;
                if (!movies || movies.length === 0) {
                    return await sock.sendMessage(from, { text: 'No movies found.' }, { quoted: msg });
                }

                let out = `🎬 *${BOT_NAME} Movie Search* 🎬\n\n`;
                movies.slice(0, 3).forEach((m, i) => {
                    out += `*\({i + 1}.\){m.title} (\({m.year})*\n⭐ Rating:\){m.rating}\n`;
                    m.torrents.forEach(t => {
                        out += `🔹 \({t.quality}: magnet:?xt=urn:btih:\){t.hash}&dn=${encodeURIComponent(m.title)}\n`;
                    });
                    out += '\n';
                });
                await sock.sendMessage(from, { text: out }, { quoted: msg });
            }
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }, { quoted: msg });
        }
    });
}

// API Endpoint for Pairing Code
app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone ? req.query.phone.replace(/[^0-9]/g, '') : '';
    if (!phone) return res.status(400).json({ error: 'Valid phone number required' });

    try {
        if (!sock) await startBot();
        const code = await sock.requestPairingCode(phone);
        res.json({ code: code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Status check API
app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});
