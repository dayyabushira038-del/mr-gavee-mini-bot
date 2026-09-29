const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_NAME = 'MR GAVEE MINI BOT';
const PREFIX = '.';

let sock = null;
let isConnected = false;

// Direct HTML Web UI
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
