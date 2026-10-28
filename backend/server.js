require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fsPromises = require('fs').promises;
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const MeshNetwork = require('./simulation');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const mesh = new MeshNetwork(120, 0.5);

let damageCache = {};
try {
    if (fs.existsSync('damage_cache.json')) {
        damageCache = JSON.parse(fs.readFileSync('damage_cache.json', 'utf8'));
    }
} catch (e) {
    console.error("Failed to load damage cache:", e);
}


wss.on('connection', (ws) => {
    mesh.wsClients.add(ws);
    ws.send(JSON.stringify({ type: 'state', nodes: Array.from(mesh.nodes.values()) }));
    ws.on('close', () => mesh.wsClients.delete(ws));
});

app.post('/sos/:nodeId', (req, res) => {
    mesh.triggerSOS(req.params.nodeId);
    res.json({ success: true });
});

app.post('/kill', (req, res) => {
    const pct = parseInt(req.query.pct) || 20;
    const nodes = Array.from(mesh.nodes.values()).filter(n => n.isAlive);
    const toKill = Math.floor((pct / 100) * nodes.length);

    nodes.sort(() => 0.5 - Math.random());
    for (let i = 0; i < toKill; i++) nodes[i].isAlive = false;

    mesh.broadcastState();
    res.json({ success: true, killed: toKill });
});

app.post('/revive', (req, res) => {
    let revived = 0;
    for (const node of mesh.nodes.values()) {
        if (!node.isAlive) { node.isAlive = true; revived++; }
    }
    mesh.broadcastState();
    res.json({ success: true, revived });
});

app.post('/sound/:nodeId', (req, res) => {
    mesh.triggerSoundAlert(req.params.nodeId, req.body.type, req.body.confidence);
    res.json({ success: true });
});

app.post('/damage-upload/:nodeId', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error("No image file provided.");
        
        const base64str = req.file.buffer.toString('base64');
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
            throw new Error("Missing or placeholder GEMINI_API_KEY in backend/.env");
        }

        const imgHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        if (damageCache[imgHash]) {
            console.log(`Returning cached result for image hash ${imgHash.substring(0,8)}...`);
            mesh.triggerDamageAlert(req.params.nodeId, damageCache[imgHash].label);
            return res.json({ ...damageCache[imgHash], cached: true });
        }

        const modelsToTry = [
            process.env.GEMINI_MODEL,
            'gemini-flash-latest',
            'gemini-3.5-flash',
            'gemini-3.8-flash',
            'gemini-2.5-flash-lite'
        ].filter(Boolean);
        
        const models = [...new Set(modelsToTry)];

        let lastErrorMsg = "Unknown error";
        let successResult = null;
        let successModel = null;

        for (const model of models) {
            let success = false;
            let attempt = 0;

            while (attempt < 3 && !success) {
                const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                console.log(`[Gemini] Requesting URL: ${baseUrl} (Attempt ${attempt + 1})`);

                const response = await fetch(`${baseUrl}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: "Analyze this image for structural damage. Classify as exactly one of: 'minor damage', 'major damage', 'possible collapse risk'. Return ONLY valid JSON in this format: {\"label\": \"<class>\", \"reason\": \"<one sentence>\"}" },
                                { inline_data: { data: base64str, mime_type: req.file.mimetype } }
                            ]
                        }],
                        generationConfig: { response_mime_type: "application/json" }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[Gemini Error] Model: ${model} | Status: ${response.status}\nBody: ${errText}`);
                    lastErrorMsg = errText;
                    
                    if ([503, 429, 500, 404].includes(response.status)) {
                        attempt++;
                        if (attempt === 1) await new Promise(r => setTimeout(r, 1000));
                        else if (attempt === 2) await new Promise(r => setTimeout(r, 2000));
                        continue;
                    } else {
                        break; // Fatal error for this model, move to next model
                    }
                }

                const data = await response.json();
                let textResponse = data.candidates[0].content.parts[0].text;
                
                textResponse = textResponse.replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                successResult = JSON.parse(textResponse);
                successModel = model;
                success = true;
            }

            if (successResult) break;
        }

        if (successResult) {
            console.log(`Damage analysis succeeded using model: ${successModel}`);
            
            // Cache it
            damageCache[imgHash] = { label: successResult.label, reason: successResult.reason };
            fs.writeFileSync('damage_cache.json', JSON.stringify(damageCache, null, 2));

            mesh.triggerDamageAlert(req.params.nodeId, successResult.label);
            res.json({ ...successResult, cached: false });
        } else {
            const fallbackResult = { label: "analysis unavailable", reason: "Service busy, please retry", details: String(lastErrorMsg).substring(0, 300) };
            res.json(fallbackResult);
        }

    } catch (err) {
        console.error("Damage upload error:", err);
        res.json({ label: "analysis unavailable", reason: "Service busy, please retry", details: err.message });
    }
});



// Health Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', nodes: mesh.nodes.size, timestamp: Date.now() });
});

// Gateway Synchronization Route
app.get('/sync-gateway', (req, res) => {
    const gateways = Array.from(mesh.nodes.values()).filter(n => n.role === 'gateway' && n.isAlive);
    let syncedLogs = [];
    
    // Harvest logs from all active gateways
    gateways.forEach(g => {
        syncedLogs = syncedLogs.concat(g.syncedData || []);
    });
    
    // Deduplicate cross-gossip
    const unique = [];
    const seen = new Set();
    for (let log of syncedLogs) {
        if (!seen.has(log.id)) {
            seen.add(log.id);
            unique.push(log);
        }
    }
    
    unique.sort((a, b) => b.ts - a.ts);
    res.json({ logs: unique });
});

server.listen(3001, () => {
    console.log('MeshRescue Backend running on http://localhost:3001');
    console.log(`[Gemini] Primary model configured as: ${process.env.GEMINI_MODEL}`);
});
