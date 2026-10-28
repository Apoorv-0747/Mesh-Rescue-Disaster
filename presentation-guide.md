# 🎤 MeshRescue: Hackathon Presentation & Judge Q&A Guide

Congratulations on building an incredible prototype! To win over the judges, you need a compelling narrative, a clear technical explanation, and a flawless demonstration. Here is your ultimate guide to presenting MeshRescue.

---

## 1. The Elevator Pitch (What is it?)

**The Problem:** When a natural disaster strikes (earthquake, hurricane, cyclone), centralized cellular infrastructure is the first thing to collapse. First responders are left blind in the chaos.
**The Solution:** **MeshRescue** is an infrastructure-free disaster coordination platform. It simulates a self-healing IoT mesh network of cheap, battery-powered edge devices. It uses Edge AI to listen for survivors, dynamically routes messages around destroyed infrastructure, and automatically triages rescue queues for first responders.

---

## 2. The Tech Stack (The "Flex")

Judges love modern, performant, and practical tech choices. Highlight these:

### Frontend (The Dashboard)
* **React 18 & Vite:** High-performance UI rendering.
* **Leaflet + Custom HTML5 Canvas:** Map rendering. **Flex:** *Standard map markers crash browsers at scale. We engineered a custom `requestAnimationFrame` Canvas layer overlaid on Leaflet to render 120+ nodes, SOS propagation waves, and neighbor links at a smooth 60 FPS without DOM thrashing.*
* **Framer Motion:** Handles the buttery-smooth FLIP animations in the Rescue Queue and slide-over UI elements.
* **TensorFlow.js (tfjs) & YAMNet:** **Flex:** *We don't stream audio to the cloud. We run a deep neural network directly inside the browser (Edge AI) using the WebAudio API. It analyzes 15,600 audio frames continuously to detect shouts, crying, or knocking.*

### Backend & Cloud
* **Node.js & Express:** Lightweight REST API for command triggers.
* **WebSockets (ws):** Real-time, bidirectional telemetry streaming for node status and mesh hops.
* **Google Gemini API / Cloud Vision:** Handles structural damage analysis on uploaded images to assess collapse risks when bandwidth *is* available.
* **A* Pathfinding Algorithm:** Calculates dynamic rescue routes around grid hazards (fires, gas, debris).

---

## 3. How to Present (The Script)

Don't just show the code—tell a story.

**Step 1: The Hook (30 seconds)**
> *"Imagine a 7.0 magnitude earthquake just hit. Cell towers are down. People are trapped. How do rescuers know where to go? Meet MeshRescue. We deploy cheap, battery-powered radio nodes across the city to form an invisible, self-healing mesh network."*

**Step 2: The Catastrophe & Healing (The Map)**
> *"Let's look at the live map."* (Click **Kill 20%**). *"A massive aftershock just destroyed 20% of our network. Watch what happens when a survivor calls for help."* (Click **Activate SOS**). 
> *"Notice the cyan waves? The network dynamically heals itself, running a Breadth-First Search to route the SOS signal through surviving nodes until it hits a Starlink-connected Gateway truck."*

**Step 3: Edge AI (The "Wow" Factor)**
> *"In a disaster, bandwidth is zero. You can't stream audio or video. So, we put the AI on the edge."* (Open the **AI Detection -> Audio tab**, ensure **Live AI** is on).
> *"This device is running TensorFlow locally. It's constantly listening."* (Clap loudly or shout into your mic). *"When it hears a distress sound, it doesn't send the audio file—it sends a tiny 50-byte text packet through the radio mesh: 'Scream detected, 95% confidence'."*

**Step 4: Automated Triage (The Queue)**
> *"Finally, we take all this data and automate the triage."* (Point to the **Rescue Queue**). *"This isn't just a list. Our algorithm ranks survivors based on severity, declining battery, and AI distress triggers. First responders instantly know exactly who needs help the most, and our A* pathfinder routes them safely around active hazards."*

*(If you are short on time, simply click the **Auto Demo** button and narrate the captions as the system automatically runs through the entire scenario!)*

---

## 4. Anticipated Judge Questions & Answers

**Q1: "How does this work without internet in the real world?"**
**A:** The physical hardware would use LoRa (Long Range) or BLE mesh radios. These radios pass tiny packets (like SMS) from node to node. Our platform simulates this packet-hopping. The internet is *only* required at the "Gateway" nodes (command centers with satellite links) to sync the dashboard.

**Q2: "Why run AI on the edge device instead of sending it to the cloud?"**
**A:** Bandwidth constraints. You cannot stream live audio or heavy video over a low-bandwidth radio mesh network. By running the TensorFlow model locally on the edge node, we only transmit a few bytes of text containing the alert and confidence score, which easily fits in a radio packet.

**Q3: "How does the triage algorithm prioritize who gets rescued?"**
**A:** It calculates a dynamic score based on a weighted formula: severity of injury (40%), group size (30%), declining battery (20%), and time since last ping (10%). Crucially, Edge AI detections (like a baby crying or a collapse risk) apply heavy flat bonuses to instantly push critical cases to the top of the queue.

**Q4: "What happens if a node moves, or a fire breaks out in the middle of a rescue?"**
**A:** The mesh is fully dynamic. If a node fails or moves, the routing table updates organically. Furthermore, our A* pathfinding algorithm is tied to the live hazard grid. If a gas leak or fire is reported in a sector, the rescue route instantly recalculates to avoid it.

**Q5: "How did you manage to render so many animations without the browser freezing?"**
**A:** We realized early on that standard DOM elements or SVG map markers cause massive layout thrashing. We engineered a dual-layer approach: invisible Leaflet markers handle click events, but all the visual rendering (120 nodes, neighbor lines, and expanding SOS shockwaves) is drawn on a raw, hardware-accelerated HTML5 Canvas synced to the map's coordinate system via `requestAnimationFrame`.
