const crypto = require('crypto');

class Node {
    constructor(id, lat, lng, role) {
        this.id = id;
        this.lat = lat;
        this.lng = lng;
        this.role = role;
        
        this.battery = Math.floor(Math.random() * 80) + 10; 
        this.severity = Math.random(); 
        this.people = Math.floor(Math.random() * 20) + 1; 
        this.lastUpdateTs = Date.now() - (Math.random() * 120000); 
        
        this.isAlive = true;
        this.seenMessages = new Set();
        this.syncedData = []; // Gateways collect network gossip payloads here
    }
}

class MeshNetwork {
    constructor(numNodes, radiusKM) {
        this.nodes = new Map();
        this.radiusKM = radiusKM;
        this.center = { lat: 37.7749, lng: -122.4194 }; 
        this.wsClients = new Set();
        this.initNodes(numNodes);
    }

    initNodes(numNodes) {
        for(let i=0; i<numNodes; i++) {
            const id = `node-${i}`;
            const r = 2000 / 111300; 
            const u = Math.random();
            const v = Math.random();
            const w = r * Math.sqrt(u);
            const t = 2 * Math.PI * v;
            const x = w * Math.cos(t);
            const y = w * Math.sin(t);
            const lat = this.center.lat + x;
            const lng = this.center.lng + y;

            let role = 'survivor';
            if (i < 5) role = 'gateway';
            else if (i < 20) role = 'rescuer';

            this.nodes.set(id, new Node(id, lat, lng, role));
        }
    }

    getDistance(node1, node2) {
        const R = 6371; 
        const dLat = (node2.lat - node1.lat) * Math.PI / 180;
        const dLon = (node2.lng - node1.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(node1.lat * Math.PI / 180) * Math.cos(node2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    getNeighbors(node) {
        const neighbors = [];
        for (const other of this.nodes.values()) {
            if (other.id !== node.id && other.isAlive) {
                if (this.getDistance(node, other) <= this.radiusKM) {
                    neighbors.push(other);
                }
            }
        }
        return neighbors;
    }

    broadcastState() {
        const state = { type: 'state', nodes: Array.from(this.nodes.values()).map(n => ({
            id: n.id, lat: n.lat, lng: n.lng, role: n.role, isAlive: n.isAlive, battery: n.battery,
            severity: n.severity, people: n.people, lastUpdateTs: n.lastUpdateTs,
            soundAlert: n.soundAlert, damage: n.damage
        }))};
        this.broadcastWS(state);
    }

    broadcastWS(msg) {
        const str = JSON.stringify(msg);
        for (const client of this.wsClients) {
            if (client.readyState === 1) { 
                client.send(str);
            }
        }
    }

    receiveMessage(nodeId, msg, fromId = null) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.isAlive) return;

        if (node.seenMessages.has(msg.id)) return;
        node.seenMessages.add(msg.id);

        // If this node is a gateway, sync and archive the mesh payload
        if (node.role === 'gateway') {
            node.syncedData.push(msg);
            this.broadcastWS({ type: 'gateway_receive', msg });
        }

        if (fromId) {
            this.broadcastWS({ type: 'hop', from: fromId, to: nodeId, msgId: msg.id });
        }

        if (msg.flags.ttl > 0) {
            const nextMsg = { ...msg, flags: { ...msg.flags, ttl: msg.flags.ttl - 1 } };
            const neighbors = this.getNeighbors(node);

            setTimeout(() => {
                for (const neighbor of neighbors) {
                    this.receiveMessage(neighbor.id, nextMsg, node.id);
                }
            }, 300);
        }
    }

    triggerSOS(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.isAlive) return;
        
        node.lastUpdateTs = Date.now();
        this.broadcastState();

        const msg = {
            id: crypto.randomUUID().substring(0,8),
            nodeId: nodeId,
            pos: { lat: parseFloat(node.lat.toFixed(4)), lng: parseFloat(node.lng.toFixed(4)) },
            status: 'SOS',
            ts: Date.now(),
            flags: { ttl: 8 } 
        };
        
        this.receiveMessage(nodeId, msg);
    }

    triggerSoundAlert(nodeId, type, confidence) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.isAlive) return;
        node.soundAlert = { type, confidence, ts: Date.now() };
        node.lastUpdateTs = Date.now(); 
        this.broadcastState();

        const msg = {
            id: crypto.randomUUID().substring(0,8), 
            nodeId: nodeId,
            status: 'SOUND',
            data: { type, confidence },
            ts: Date.now(),
            flags: { ttl: 8 } 
        };
        this.receiveMessage(nodeId, msg);
    }

    triggerDamageAlert(nodeId, label) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.isAlive) return;
        node.damage = label;
        node.lastUpdateTs = Date.now();
        this.broadcastState();

        const msg = {
            id: crypto.randomUUID().substring(0,8), 
            nodeId: nodeId,
            status: 'DAMAGE',
            data: { label },
            ts: Date.now(),
            flags: { ttl: 8 } 
        };
        this.receiveMessage(nodeId, msg);
    }
}
module.exports = MeshNetwork;
