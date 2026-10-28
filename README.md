# 🚨 MeshRescue: Decentralized Disaster Response Network

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-YAMNet-orange.svg)](https://www.tensorflow.org/js)
[![Node.js](https://img.shields.io/badge/Node.js-Express-green.svg)](https://nodejs.org/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Realtime-purple.svg)](https://github.com/websockets/ws)
[![Gemini](https://img.shields.io/badge/Google_Gemini-Multimodal_AI-8E75B2.svg)](https://ai.google.dev/)

> **An infrastructure-free, self-healing IoT mesh network and Edge AI platform that detects survivors, dynamically routes around disaster hazards, and automates emergency triage when cellular networks fail.**

---

## 📌 The Problem
During catastrophic natural disasters (earthquakes, cyclones, floods), centralized cellular towers and power grids are the first points of failure. Rescuers operate blind, unable to locate survivors trapped under debris or assess impassable hazard zones. Meanwhile, traditional cloud AI is useless without active internet.

## 💡 The Solution: MeshRescue
**MeshRescue** coordinates emergency response in zero-connectivity environments:
1. **Self-Healing Radio Mesh:** Low-power edge nodes (LoRa/BLE simulation) form an autonomous peer-to-peer mesh using epidemic gossip and store-and-forward routing.
2. **On-Device Edge AI (YAMNet):** Nodes run TensorFlow.js directly in-browser/on-edge to detect acoustic distress signatures (screams, knocks, cries). Instead of streaming heavy audio files over low-bandwidth radios, nodes transmit tiny 50-byte alert packets.
3. **Dynamic A* Hazard Avoidance:** Real-time routing bypasses fires, toxic gas plumes, and collapsed buildings.
4. **Smart Triage Priority Engine:** Automatically ranks trapped survivors by vital metrics (injury severity, battery drain rate, acoustic distress triggers).
5. **High-Performance 60 FPS Visualizer:** Custom HTML5 Canvas engine rendering 120+ active nodes, BFS message propagation waves, and failure shockwaves smoothly without DOM lag.

---

## ⚡ Key Features

- **🌐 120-Node Self-Healing Topology:** Simulates resilient packet hopping with dynamic TTL deduplication and routing around destroyed nodes.
- **🎧 Edge Audio Triage (TensorFlow.js):** 
  - Real-time classification of 521 audio classes mapped to emergency categories (*Speech, Knock/Tap, Shout/Scream, Crying, Noise, Silence*).
  - Processes 15,600 audio frames continuously via WebAudio API.
  - Throttled telemetry stream updates 4 times per second to prevent UI stutter.
- **🏢 Structural Damage Assessment (Gemini Multimodal AI):**
  - Instant image analysis of building collapse risk, structural fissures, and debris traps.
  - Automatic fallback scoring and local caching for low-bandwidth scenarios.
- **🧭 Dynamic A* Pathfinding:**
  - Real-time hazard grid (Fire, Gas, Blocked routes).
  - Instant recalculation of safe corridors for rescue teams to reach critical survivors.
- **📋 Priority Rescue Queue:**
  - Automated triage scoring based on severity ($40\%$), group size ($30\%$), declining battery ($20\%$), and time-since-ping ($10\%$) with AI alert boosts.
  - FLIP reordering animations via Framer Motion.
- **🎮 Interactive Presentation & Auto-Demo Mode:**
  - Step-by-step automated catastrophe sequence showing network destruction, distress propagation, and gateway triage delivery.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18, Vite
- **Mapping & Visuals:** Leaflet, React-Leaflet, custom hardware-accelerated **HTML5 Canvas `<CanvasOverlay>`** (running via `requestAnimationFrame`)
- **Edge AI:** `@tensorflow/tfjs` + YAMNet Audio Classifier
- **Animations & Icons:** `framer-motion`, `lucide-react`
- **Audio Processing:** Web Audio API (`AudioContext`, `ScriptProcessorNode`)

### Backend & Network Simulation
- **Runtime:** Node.js, Express.js
- **Real-Time Streaming:** WebSockets (`ws`) for bidirectional node telemetry
- **Cloud AI (Optional/Gateway):** Google Gemini 2.5 Flash API (`@google/genai`)
- **Routing Engine:** Custom A* Pathfinding + Epidemic Gossip Protocol

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm`

### 1. Clone the Repository
```bash
git clone https://github.com/Apoorv-0747/Mesh-Rescue-Disaster.git
cd Mesh-Rescue-Disaster
```

### 2. Backend Setup
```bash
cd backend
npm install
```

*(Optional)* Create a `.env` file in `/backend` to enable Gemini Structural Analysis:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Start the backend server:
```bash
npm start
```
*Backend runs on `http://localhost:3001` with active WebSocket telemetry.*

### 3. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
*Frontend will launch at `http://localhost:5173`.*

---

## 📖 Real-World Hardware Architecture

While MeshRescue's control station runs on web technology, the physical edge nodes are designed for ultra-low-cost deployment:
- **Node Hardware:** ESP32-S3 microcontroller + Semtech SX1262 LoRa module ($15 per node).
- **Communication:** 868/915 MHz LoRa mesh (Meshtastic-compatible protocol), transmitting up to 5-10 km per hop.
- **Edge Sensing:** I2S MEMS microphone for acoustic triage.
- **Gateway:** Solar-powered base station or satellite-linked emergency vehicle syncing telemetry to the MeshRescue dashboard.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
