import L from 'leaflet';
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, CircleMarker, Polyline, Rectangle, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import * as tf from '@tensorflow/tfjs';
import { Activity, ActivitySquare, Skull, RefreshCw, Layers, Radio, XSquare, Flame, Wind, Anchor, Mic, Camera, Battery, MapPin, Search, ShieldAlert, Wifi, XCircle, Cpu, PlayCircle, Square, Upload, Music, Star, Plus, Minus, Maximize, Check, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import 'leaflet/dist/leaflet.css';
import './App.css';

const API_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

const GRID_SIZE = 20;
const MAP_CENTER_LAT = 37.7749;
const MAP_CENTER_LNG = -122.4194;
const SPAN_LAT = 0.045; 
const SPAN_LNG = 0.045; 
const MIN_LAT = MAP_CENTER_LAT - SPAN_LAT / 2;
const MIN_LNG = MAP_CENTER_LNG - SPAN_LNG / 2;
const CELL_H = SPAN_LAT / GRID_SIZE;
const CELL_W = SPAN_LNG / GRID_SIZE;

const getGridCell = (lat, lng) => {
    let x = Math.floor((lng - MIN_LNG) / CELL_W);
    let y = Math.floor((lat - MIN_LAT) / CELL_H);
    return { x: Math.max(0, Math.min(GRID_SIZE - 1, x)), y: Math.max(0, Math.min(GRID_SIZE - 1, y)) };
};
const getCellCenter = (x, y) => [MIN_LAT + y * CELL_H + CELL_H / 2, MIN_LNG + x * CELL_W + CELL_W / 2];

function aStar(start, end, hazards) {
    if (!start || !end || hazards[`${end.x},${end.y}`] === 'blocked') return null; 
    const openSet = [{ x: start.x, y: start.y, f: 0, g: 0, path: [] }];
    const closedSet = new Set();
    
    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        const key = `${current.x},${current.y}`;
        
        if (current.x === end.x && current.y === end.y) return [...current.path, [current.x, current.y]];
        if (closedSet.has(key)) continue;
        closedSet.add(key);
        
        const neighbors = [{dx:0,dy:1}, {dx:1,dy:0}, {dx:0,dy:-1}, {dx:-1,dy:0}, {dx:1,dy:1}, {dx:1,dy:-1}, {dx:-1,dy:-1}, {dx:-1,dy:1}];
        for (let n of neighbors) {
            const nx = current.x + n.dx, ny = current.y + n.dy;
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            
            const nKey = `${nx},${ny}`;
            if (closedSet.has(nKey)) continue;
            
            const hType = hazards[nKey];
            if (hType === 'blocked') continue; 
            
            let cost = (n.dx !== 0 && n.dy !== 0) ? 1.414 : 1;
            if (hType === 'fire') cost *= 10;
            else if (hType === 'gas') cost *= 5;
            
            const g = current.g + cost, h = Math.abs(end.x - nx) + Math.abs(end.y - ny);
            openSet.push({ x: nx, y: ny, g, f: g + h, path: [...current.path, [current.x, current.y]] });
        }
    }
    return null;
}

function reconstructPath(hops, gatewayId) {
    const path = [gatewayId];
    let curr = gatewayId;
    let iterations = 0;
    while (iterations < 100) {
        const h = hops.find(h => h.to === curr);
        if (!h) break;
        path.unshift(h.from);
        curr = h.from;
        iterations++;
    }
    return path;
}

const computeBFSWave = (sourceId, nodesArray) => {
    const adj = {};
    const aliveNodes = nodesArray.filter(n => n.isAlive);
    aliveNodes.forEach(n => adj[n.id] = []);
    for (let i = 0; i < aliveNodes.length; i++) {
        for (let j = i+1; j < aliveNodes.length; j++) {
            const dx = aliveNodes[i].lng - aliveNodes[j].lng;
            const dy = aliveNodes[i].lat - aliveNodes[j].lat;
            if (dx*dx + dy*dy <= 0.005*0.005) {
                adj[aliveNodes[i].id].push(aliveNodes[j].id);
                adj[aliveNodes[j].id].push(aliveNodes[i].id);
            }
        }
    }
    const bfsLinks = [];
    const visited = new Set([sourceId]);
    let queue = [sourceId];
    let depth = 0;
    while (queue.length > 0) {
        const nextQueue = [];
        for (const u of queue) {
            if (!adj[u]) continue;
            for (const v of adj[u]) {
                if (!visited.has(v)) {
                    visited.add(v);
                    nextQueue.push(v);
                    bfsLinks.push({ from: u, to: v, depth });
                }
            }
        }
        queue = nextQueue;
        depth++;
    }
    return { links: bfsLinks, reached: visited.size, total: aliveNodes.length };
};

const getAudioCategory = (className) => {
    const c = (className || '').toLowerCase();
    if (c.includes('speech') || c.includes('conversation')) return { icon: <Mic size={12}/>, name: 'Speech', color: 'var(--accent)' };
    if (c.includes('knock') || c.includes('tap') || c.includes('wood')) return { icon: <Activity size={12}/>, name: 'Knock/Tap', color: 'var(--warning)' };
    if (c.includes('shout') || c.includes('scream') || c.includes('yell')) return { icon: <ShieldAlert size={12}/>, name: 'Shout/Scream', color: 'var(--danger)' };
    if (c.includes('cry') || c.includes('baby') || c.includes('sob')) return { icon: <ActivitySquare size={12}/>, name: 'Crying', color: 'var(--danger)' };
    if (c.includes('music') || c.includes('song') || c.includes('instrument')) return { icon: <Music size={12}/>, name: 'Music', color: '#a855f7' };
    if (c.includes('noise') || c.includes('static') || c.includes('environmental')) return { icon: <Wind size={12}/>, name: 'Noise', color: 'var(--text-muted)' };
    if (c.includes('silence')) return { icon: <Square size={12}/>, name: 'Silence', color: 'var(--text-muted)' };
    return { icon: <Radio size={12}/>, name: 'Other', color: 'var(--text-muted)' };
};

const MapControls = ({ nodes }) => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    
    useEffect(() => {
        const updateZoom = () => setZoom(map.getZoom());
        map.on('zoom', updateZoom);
        
        const handleKeyDown = (e) => {
            if (e.key === '+' || e.key === '=') map.zoomIn();
            else if (e.key === '-') map.zoomOut();
            else if (e.key === '0') {
                const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
                bounds.extend([[MIN_LAT, MIN_LNG], [MIN_LAT + SPAN_LAT, MIN_LNG + SPAN_LNG]]);
                if (bounds.isValid()) map.fitBounds(bounds, { padding: [30,30] });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => { map.off('zoom', updateZoom); window.removeEventListener('keydown', handleKeyDown); };
    }, [map, nodes]);

    return (
        <div style={{ position: 'absolute', top: 15, left: 15, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => map.zoomIn()} className="panel-glass map-btn" title="Zoom In (+)"><Plus size={16} /></button>
            <button onClick={() => map.zoomOut()} className="panel-glass map-btn" title="Zoom Out (-)"><Minus size={16} /></button>
            <button onClick={() => {
                const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
                bounds.extend([[MIN_LAT, MIN_LNG], [MIN_LAT + SPAN_LAT, MIN_LNG + SPAN_LNG]]);
                if (bounds.isValid()) map.fitBounds(bounds, { padding: [30,30] });
            }} className="panel-glass map-btn" title="Fit to nodes (0)"><Maximize size={14} /></button>
            <div className="panel-glass" style={{ fontSize: '0.7rem', padding: '4px 0', textAlign: 'center', fontWeight: 'bold' }}>{Math.round(zoom)}z</div>
        </div>
    );
};

const MapBoundsFitter = ({ nodes }) => {
    const map = useMap();
    useEffect(() => {
        if (!nodes || nodes.length === 0) return;
        let timeout;
        const applyBounds = () => {
            map.invalidateSize();
            const nodeBounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
            const gridBounds = L.latLngBounds([[MIN_LAT, MIN_LNG], [MIN_LAT + SPAN_LAT, MIN_LNG + SPAN_LNG]]);
            nodeBounds.extend(gridBounds);
            if (nodeBounds.isValid()) {
                map.fitBounds(nodeBounds, { padding: [30, 30], maxZoom: 16 });
            }
        };
        const onResize = () => {
            clearTimeout(timeout);
            timeout = setTimeout(applyBounds, 150);
        };
        window.addEventListener('resize', onResize);
        if (nodes.length === 120) setTimeout(applyBounds, 100);
        return () => {
            window.removeEventListener('resize', onResize);
            clearTimeout(timeout);
        };
    }, [map, nodes.length === 120]);
    return null;
};

const CanvasOverlay = ({ nodes, waves, hoveredNode, systemEvent, highlightEvent }) => {
    const map = useMap();
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let raf;
        
        const render = () => {
            if (document.hidden) {
                raf = requestAnimationFrame(render);
                return;
            }
            
            const size = map.getSize();
            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
                canvas.width = size.x * dpr;
                canvas.height = size.y * dpr;
                canvas.style.width = size.x + 'px';
                canvas.style.height = size.y + 'px';
            }
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.scale(dpr, dpr);
            
            const nodePts = {};
            nodes.forEach(n => {
                nodePts[n.id] = map.latLngToContainerPoint([n.lat, n.lng]);
            });
            
            // 1. System Events (Kill/Revive Shockwave)
            const now = Date.now();
            if (systemEvent && now - systemEvent.ts < 2000) {
                const elapsed = now - systemEvent.ts;
                const centerPt = map.latLngToContainerPoint([MAP_CENTER_LAT, MAP_CENTER_LNG]);
                
                if (elapsed < 600) {
                    const prog = elapsed / 600;
                    ctx.beginPath();
                    ctx.arc(centerPt.x, centerPt.y, prog * 1000, 0, 2*Math.PI);
                    ctx.strokeStyle = systemEvent.type === 'kill' ? `rgba(239, 68, 68, ${0.5 * (1-prog)})` : `rgba(16, 185, 129, ${0.5 * (1-prog)})`;
                    ctx.lineWidth = 10;
                    ctx.stroke();
                }
            }
            
            // 2. Static Neighbor Links
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            for (let i = 0; i < nodes.length; i++) {
                if (!nodes[i].isAlive) continue;
                for (let j = i + 1; j < nodes.length; j++) {
                    if (!nodes[j].isAlive) continue;
                    const dx = nodes[i].lng - nodes[j].lng;
                    const dy = nodes[i].lat - nodes[j].lat;
                    if (dx*dx + dy*dy <= 0.005*0.005) {
                        const p1 = nodePts[nodes[i].id];
                        const p2 = nodePts[nodes[j].id];
                        if(p1 && p2) {
                            ctx.moveTo(p1.x, p1.y);
                            ctx.lineTo(p2.x, p2.y);
                        }
                    }
                }
            }
            ctx.stroke();
            
            // 3. Highlight Pan Ring
            if (highlightEvent && now - highlightEvent.ts < 1500) {
                const elapsed = now - highlightEvent.ts;
                const pt = nodePts[highlightEvent.id];
                if (pt) {
                    const prog = (elapsed % 500) / 500;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 8 + prog * 15, 0, 2*Math.PI);
                    ctx.strokeStyle = `rgba(34, 211, 238, ${1 - prog})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }

            // 4. Waves
            Object.values(waves).forEach(wave => {
                const elapsed = now - wave.startTime;
                
                // Phase A: SOS Rings (0 - 0.4s and beyond for visibility)
                if (wave.source && elapsed < 3000) {
                    const pt = nodePts[wave.source];
                    if (pt) {
                        for (let i = 0; i < 3; i++) {
                            const ringElapsed = elapsed - i * 150;
                            if (ringElapsed > 0 && ringElapsed < 1000) {
                                const prog = ringElapsed / 1000;
                                ctx.beginPath();
                                ctx.arc(pt.x, pt.y, prog * 50, 0, 2 * Math.PI);
                                ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 * (1 - prog)})`;
                                ctx.lineWidth = 2;
                                ctx.stroke();
                            }
                        }
                        if (elapsed < 2000) {
                            const tagProg = elapsed / 2000;
                            ctx.fillStyle = `rgba(245, 158, 11, ${1 - tagProg})`;
                            ctx.font = 'bold 12px Inter';
                            ctx.fillText('SOS', pt.x + 12, pt.y - 12);
                        }
                    }
                }
                
                // Phase B: Mesh discovery BFS
                if (wave.bfsLinks && elapsed > 400 && elapsed < 5000) {
                    let segmentsDrawn = 0;
                    wave.bfsLinks.forEach(link => {
                        if (segmentsDrawn >= 150) return;
                        const p1 = nodePts[link.from];
                        const p2 = nodePts[link.to];
                        if (!p1 || !p2) return;
                        
                        const linkStart = 400 + link.depth * 300;
                        const linkElapsed = elapsed - linkStart;
                        if (linkElapsed < 0 || linkElapsed > 2500) return;
                        
                        segmentsDrawn++;
                        
                        const fadeProg = linkElapsed > 400 ? (linkElapsed - 400) / 2100 : 0;
                        const globalAlpha = 1 - fadeProg;
                        
                        const lineProg = Math.min(1, linkElapsed / 300);
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p1.x + (p2.x - p1.x) * lineProg, p1.y + (p2.y - p1.y) * lineProg);
                        ctx.strokeStyle = `rgba(34, 211, 238, ${0.7 * globalAlpha})`;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        
                        if (linkElapsed < 400) {
                            const dotProg = linkElapsed / 400;
                            const dx = p1.x + (p2.x - p1.x) * dotProg;
                            const dy = p1.y + (p2.y - p1.y) * dotProg;
                            ctx.beginPath();
                            ctx.arc(dx, dy, 2, 0, 2*Math.PI);
                            ctx.fillStyle = '#fff';
                            ctx.fill();
                        }
                        
                        if (linkElapsed > 400 && linkElapsed < 700) {
                            const flashProg = (linkElapsed - 400) / 300;
                            ctx.beginPath();
                            ctx.arc(p2.x, p2.y, 6 + 3 * (1 - flashProg), 0, 2*Math.PI);
                            ctx.strokeStyle = `rgba(255, 255, 255, ${1 - flashProg})`;
                            ctx.lineWidth = 2;
                            ctx.stroke();
                            
                            ctx.beginPath();
                            ctx.arc(p2.x, p2.y, 6 + 1.5 * (1 - flashProg), 0, 2*Math.PI);
                            ctx.strokeStyle = `rgba(34, 211, 238, ${1 - flashProg})`;
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    });
                }
                
                // Phase C: Real Gateway Path Highlight
                if (wave.gatewayPath && wave.gatewayReachedTs && now > wave.gatewayReachedTs) {
                    const pathElapsed = now - wave.gatewayReachedTs;
                    if (pathElapsed < 4000) {
                        const alpha = pathElapsed < 1500 ? 0.95 : 0.95 * (1 - (pathElapsed - 1500) / 2500);
                        
                        ctx.beginPath();
                        for (let i = 0; i < wave.gatewayPath.length; i++) {
                            const pt = nodePts[wave.gatewayPath[i]];
                            if (pt) {
                                if (i === 0) ctx.moveTo(pt.x, pt.y);
                                else ctx.lineTo(pt.x, pt.y);
                            }
                        }
                        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
                        ctx.lineWidth = 3;
                        ctx.stroke();
                        
                        const gwPt = nodePts[wave.gatewayPath[wave.gatewayPath.length - 1]];
                        if (gwPt) {
                            ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
                            ctx.font = 'bold 11px Inter';
                            ctx.fillText(`Delivered in ${wave.gatewayPath.length - 1} hops`, gwPt.x + 15, gwPt.y + 15);
                        }
                    }
                }
            });

            // 5. Nodes
            nodes.forEach(n => {
                const pt = nodePts[n.id];
                if (!pt) return;
                
                const isHovered = hoveredNode === n.id;
                const radius = n.role === 'gateway' ? (isHovered ? 10 : 8) : (isHovered ? 8 : 6);
                
                let sysElapsed = 0;
                let isSysAnim = false;
                if (systemEvent && systemEvent.nodes.includes(n.id)) {
                    sysElapsed = now - systemEvent.ts - (systemEvent.nodes.indexOf(n.id) * (systemEvent.type === 'kill' ? 20 : 15));
                    if (sysElapsed > 0 && sysElapsed < 300) isSysAnim = true;
                }
                
                if (isSysAnim) {
                    const prog = sysElapsed / 300;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, radius + 10 * (1-prog), 0, 2*Math.PI);
                    ctx.strokeStyle = systemEvent.type === 'kill' ? `rgba(239, 68, 68, ${1-prog})` : `rgba(16, 185, 129, ${1-prog})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, radius, 0, 2*Math.PI);
                
                if (!n.isAlive) {
                    ctx.fillStyle = 'rgba(100, 116, 139, 0.95)';
                    ctx.fill();
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(pt.x - 2, pt.y - 2); ctx.lineTo(pt.x + 2, pt.y + 2);
                    ctx.moveTo(pt.x + 2, pt.y - 2); ctx.lineTo(pt.x - 2, pt.y + 2);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    let fillColor = '#f59e0b';
                    let strokeColor = '#d97706';
                    if (n.role === 'gateway') { fillColor = '#22d3ee'; strokeColor = '#0891b2'; }
                    else if (n.role === 'rescuer') { fillColor = '#10b981'; strokeColor = '#059669'; }
                    
                    ctx.fillStyle = fillColor;
                    ctx.globalAlpha = 0.95;
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                    
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, radius + 1.5, 0, 2*Math.PI);
                    ctx.strokeStyle = `rgba(255, 255, 255, 0.35)`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    if (n.role === 'gateway') {
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, radius + 3, 0, 2*Math.PI);
                        ctx.strokeStyle = `rgba(34, 211, 238, 0.35)`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            });
            
            ctx.restore();
            raf = requestAnimationFrame(render);
        };
        
        raf = requestAnimationFrame(render);
        return () => cancelAnimationFrame(raf);
    }, [map, nodes, waves, hoveredNode, systemEvent, highlightEvent]);
    
    return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 450, pointerEvents: 'none' }} />;
};

const QueueRow = React.memo(({ n, i, isTop, isSelected, onClick }) => {
    const barColor = n.score > 2.5 ? 'var(--danger)' : (n.score > 1.5 ? 'var(--warning)' : 'var(--success)');
    const hasDamage = !!n.damage;
    const hasSound = n.soundAlert && (Date.now() - n.soundAlert.ts < 20000);
    
    return (
        <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
            className={`queue-card ${isSelected ? 'selected' : ''}`} onClick={() => onClick(n)}
            style={{ borderLeft: `4px solid ${barColor}`, border: isTop ? `1px solid var(--accent)` : undefined, padding: '8px 12px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px' }}>#{i + 1}</span>
                    <strong style={{ fontSize: '0.85rem' }}>{n.id}</strong>
                    {isTop && <Star size={12} color="var(--warning)" fill="var(--warning)" />}
                </div>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.9rem' }}><AnimatedScore value={n.score} /></span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <Battery size={10} color="var(--text-muted)" />
                <div style={{ width: '30px', background: 'var(--border)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${n.battery}%`, background: n.battery > 50 ? 'var(--success)' : n.battery > 20 ? 'var(--warning)' : 'var(--danger)', height: '100%' }} />
                </div>
                
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {hasDamage && <span className="badge" style={{ background: 'var(--warning)', color: '#000', fontSize: '0.55rem', padding: '1px 4px' }}><Camera size={8}/> DMG</span>}
                    {hasSound && <span className="badge" style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.55rem', padding: '1px 4px' }}><Mic size={8}/> {n.soundAlert.type}</span>}
                </div>
            </div>
            
            <AnimatePresence>
                {isSelected && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={10} /> {n.lat.toFixed(4)}, {n.lng.toFixed(4)}</div>
                            {hasDamage && <div style={{ color: 'var(--warning)' }}>Damage: {n.damage}</div>}
                            {hasSound && <div style={{ color: 'var(--danger)' }}>Sound: {n.soundAlert.type} ({n.soundAlert.isClip ? 'CLIP' : 'AI'})</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});

const AnimatedScore = ({ value }) => {
    const nodeRef = useRef(null);
    useEffect(() => {
        const node = nodeRef.current;
        if (!node) return;
        const controls = animate(parseFloat(node.textContent) || 0, parseFloat(value) || 0, {
            duration: 0.5, ease: "easeOut", onUpdate(v) { node.textContent = v.toFixed(2); }
        });
        return controls.stop;
    }, [value]);
    return <span ref={nodeRef}>{(Number(value) || 0).toFixed(2)}</span>;
};

const AnimatedInteger = ({ value }) => {
    const nodeRef = useRef(null);
    useEffect(() => {
        const node = nodeRef.current;
        if (!node) return;
        const controls = animate(parseInt(node.textContent, 10) || 0, parseInt(value, 10) || 0, {
            duration: 0.5, ease: "easeOut", onUpdate(v) { node.textContent = Math.round(v); }
        });
        return controls.stop;
    }, [value]);
    return <span ref={nodeRef}>{Number(value) || 0}</span>;
};

const RingChart = ({ alive, total }) => {
    const pct = total === 0 ? 0 : alive / total;
    const color = pct === 1 ? 'var(--success)' : (pct > 0.6 ? 'var(--warning)' : 'var(--danger)');
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', height: '120px' }}>
            <svg width="100" height="100" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border)" strokeWidth="3" />
                <motion.path 
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="3" 
                    strokeDasharray={`${pct * 100}, 100`}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: color }}>
                    <AnimatedInteger value={alive} />
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>/ {total}</div>
            </div>
        </div>
    );
};

const StatCard = React.memo(({ title, value, color, tooltip, isFloat, isString }) => (
    <div className="panel-glass" title={tooltip} style={{ padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: '14px' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: '1.6rem', fontWeight: 'bold', color: color || 'var(--text)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
            {value === '-' ? '-' : (isString ? value : (isFloat ? <AnimatedScore value={value} /> : <AnimatedInteger value={value} />))}
        </span>
    </div>
));

const StatusPill = ({ isConnected }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 4px ${isConnected ? 'var(--success)' : 'var(--danger)'}` }} />
        {isConnected ? 'Backend connected' : 'Offline'}
    </div>
);

const Legend = () => {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 1000 }}>
            {!open ? (
                <button onClick={() => setOpen(true)} className="panel-glass" style={{ padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer', background: 'rgba(7,11,20,0.85)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px' }}>Legend</button>
            ) : (
                <div className="panel-glass" style={{ padding: '10px', fontSize: '0.75rem', background: 'rgba(7,11,20,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong>Map Legend</strong>
                        <XCircle size={14} cursor="pointer" onClick={() => setOpen(false)} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#f59e0b'}}/> Survivor</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#10b981'}}/> Rescuer</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#22d3ee', border:'1px solid #0891b2'}}/> Gateway</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#64748b'}}/> Failed</div>
                </div>
            )}
        </div>
    );
};

const Splash = ({ onComplete }) => {
    useEffect(() => {
        const t = setTimeout(onComplete, 2200);
        const skip = () => { clearTimeout(t); onComplete(); };
        window.addEventListener('keydown', skip);
        window.addEventListener('click', skip);
        return () => { window.removeEventListener('keydown', skip); window.removeEventListener('click', skip); clearTimeout(t); };
    }, [onComplete]);
    
    return (
        <motion.div initial={{opacity:1}} exit={{opacity:0}} transition={{duration:0.5}} className="splash-screen">
            <div className="splash-logo">
                <svg width="100" height="100" viewBox="0 0 100 100" style={{ margin: '0 auto' }}>
                    <circle cx="50" cy="50" r="2" fill="var(--accent)" className="dot d1" />
                    <circle cx="20" cy="20" r="2" fill="var(--accent)" className="dot d2" />
                    <circle cx="80" cy="20" r="2" fill="var(--accent)" className="dot d3" />
                    <circle cx="20" cy="80" r="2" fill="var(--accent)" className="dot d4" />
                    <circle cx="80" cy="80" r="2" fill="var(--accent)" className="dot d5" />
                    <path d="M50 50 L20 20 M50 50 L80 20 M50 50 L20 80 M50 50 L80 80 M20 20 L80 20 L80 80 L20 80 Z" stroke="var(--accent)" strokeWidth="1" fill="none" className="mesh-lines" />
                    <circle cx="50" cy="50" r="20" stroke="var(--accent)" strokeWidth="1" fill="none" className="splash-ripple" />
                </svg>
                <h2>MeshRescue</h2>
                <p>Infrastructure-free disaster coordination</p>
                <div className="loading-bar"><div className="loading-bar-fill" /></div>
            </div>
            <button onClick={onComplete} className="btn btn-ghost" style={{ position: 'absolute', bottom: '30px', right: '30px' }}>Skip</button>
        </motion.div>
    );
};

export default function App() {
    const [isAppLoaded, setIsAppLoaded] = useState(false);
    const [showSplash, setShowSplash] = useState(true);
    const [nodes, setNodes] = useState([]);
    const [waves, setWaves] = useState({});
    const [weights] = useState({ severity: 0.4, people: 0.3, battery: 0.2, staleness: 0.1 });
    
    const [hazardMode, setHazardMode] = useState('clear');
    const [hazards, setHazards] = useState({});
    const [showHeatmap, setShowHeatmap] = useState(false);
    
    const [isDemoRunning, setIsDemoRunning] = useState(false);
    const demoRunningRef = useRef(false);
    const [demoState, setDemoState] = useState(null);

    const [selectedTargetId, setSelectedTargetId] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [systemEvent, setSystemEvent] = useState(null);
    const [highlightEvent, setHighlightEvent] = useState(null);
    const mapRef = useRef(null);

    const [showDashboard, setShowDashboard] = useState(false);
    const [dashboardData, setDashboardData] = useState(null);

    const [aiTab, setAiTab] = useState('audio');
    const [aiMode, setAiMode] = useState('off'); 
    const [recentDetection, setRecentDetection] = useState(null);
    const [modelStatus, setModelStatus] = useState('Standby');
    const [debugInfo, setDebugInfo] = useState(null);
    const debugInfoRef = useRef(null);
    const [isDebugging, setIsDebugging] = useState(false);
    
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [micErrorNote, setMicErrorNote] = useState('');

    const [damageResult, setDamageResult] = useState(null);
    const [lastDamageFile, setLastDamageFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const cameraVideoRef = useRef(null);
    const cameraStreamRef = useRef(null);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const [localLogs, setLocalLogs] = useState([]);
    const [stats, setStats] = useState({ relayed: 0, sosEvents: 0 });
    const [toast, setToast] = useState(null);

    const nodesRef = useRef({});
    const logsEndRef = useRef(null);
    const yamnetModelRef = useRef(null);
    const yamnetClassesRef = useRef(null);
    const audioCtxRef = useRef(null);
    const micStreamRef = useRef(null);
    const processorRef = useRef(null);
    const errorLoggedRef = useRef(false);
    const selectedTargetIdRef = useRef(selectedTargetId);
    
    useEffect(() => {
        selectedTargetIdRef.current = selectedTargetId;
    }, [selectedTargetId]);

    const addLog = (text, type = 'info') => {
        setLocalLogs(prev => [...prev, { id: Math.random(), ts: Date.now(), text, type }].slice(-100));
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') setShowDashboard(false); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'state') {
                const oldNodes = nodesRef.current;
                let killed = [];
                let revived = [];
                if (Object.keys(oldNodes).length > 0) {
                    data.nodes.forEach(n => {
                        const old = oldNodes[n.id];
                        if (old) {
                            if (old.isAlive && !n.isAlive) killed.push(n.id);
                            if (!old.isAlive && n.isAlive) revived.push(n.id);
                        }
                    });
                    if (killed.length > 0) {
                        setSystemEvent({ type: 'kill', ts: Date.now(), nodes: killed });
                        showToast(`${killed.length} nodes failed`);
                    }
                    if (revived.length > 0) {
                        setSystemEvent({ type: 'revive', ts: Date.now(), nodes: revived });
                        showToast(`All nodes revived`);
                    }
                }

                setNodes(data.nodes);
                const nr = {};
                data.nodes.forEach(n => nr[n.id] = n);
                nodesRef.current = nr;
                setIsAppLoaded(true);
            } else if (data.type === 'hop') {
                setWaves(prev => {
                    const next = { ...prev };
                    if (!next[data.msgId]) {
                        next[data.msgId] = { 
                            id: data.msgId, 
                            source: data.from, 
                            startTime: Date.now(), 
                            bfsLinks: computeBFSWave(data.from, Object.values(nodesRef.current)).links,
                            hops: [], 
                            gatewayPath: null, 
                            gatewayReachedTs: null 
                        };
                    }
                    const wave = next[data.msgId];
                    const depth = 8 - data.ttl;
                    wave.hops.push({ from: data.from, to: data.to, depth });
                    
                    const toNode = nodesRef.current[data.to];
                    if (toNode && toNode.role === 'gateway' && !wave.gatewayPath) {
                        wave.gatewayPath = reconstructPath(wave.hops, data.to);
                        wave.gatewayReachedTs = Date.now();
                    }
                    return next;
                });
                setStats(s => ({ ...s, relayed: s.relayed + 1 }));
            } else if (data.type === 'event') {
                const cleanId = data.nodeId.replace('node-', '');
                if (data.status === 'SOS') {
                    setStats(s => ({ ...s, sosEvents: s.sosEvents + 1 }));
                    addLog(`Node ${cleanId} SOS received`, 'warning');
                    const bfs = computeBFSWave(data.nodeId, Object.values(nodesRef.current));
                    showToast(`SOS broadcast from node ${cleanId} - network reached ${bfs.reached} of ${bfs.total} nodes`);
                } else if (data.status === 'SOUND') {
                    addLog(`Node ${cleanId} audio detection: ${data.data.type}`, 'danger');
                } else if (data.status === 'DAMAGE') {
                    addLog(`Node ${cleanId} structural damage: ${data.data.label}`, 'warning');
                }
            }
        };
        ws.onclose = () => setIsAppLoaded(false);
        return () => {
            if (ws.readyState === 1) ws.close();
            else ws.onopen = () => ws.close();
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setWaves(prev => {
                const next = { ...prev };
                const now = Date.now();
                let changed = false;
                for (const id in next) {
                    if (now - next[id].startTime > 10000) {
                        delete next[id];
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleVisibility = () => {
            document.body.classList.toggle('animations-paused', document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [localLogs]);

    const getAudioDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput');
            setAudioDevices(inputs);
            if (inputs.length > 0 && !selectedDeviceId) setSelectedDeviceId(inputs[0].deviceId);
        } catch(err) { console.error(err); }
    }, [selectedDeviceId]);

    useEffect(() => {
        getAudioDevices();
        navigator.mediaDevices.addEventListener('devicechange', getAudioDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getAudioDevices);
    }, [getAudioDevices]);

    const triggerSOS = (nodeId) => fetch(`${API_URL}/sos/${nodeId}`, { method: 'POST' }).catch(() => {});

    const stopAutoDemo = () => {
        demoRunningRef.current = false;
        setIsDemoRunning(false);
        setDemoState(null);
    };

    const runAutoDemo = async () => {
        if (demoRunningRef.current) { stopAutoDemo(); return; }
        demoRunningRef.current = true;
        setIsDemoRunning(true);
        
        try {
            setDemoState({ step: 0, caption: "System Reboot: Reviving all nodes and clearing hazards" });
            await fetch(`${API_URL}/revive`, { method: 'POST' });
            setHazards({});
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 1500));
            
            setDemoState({ step: 1, caption: "Survivor sends SOS broadcast" });
            triggerRandomSOS();
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 2500));
            
            setDemoState({ step: 2, caption: "20% of nodes fail, mesh still delivers" });
            await fetch(`${API_URL}/kill?pct=20`, { method: 'POST' });
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 2000));
            
            setDemoState({ step: 3, caption: "Another survivor triggers SOS in compromised mesh" });
            triggerRandomSOS();
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 2500));
            
            setDemoState({ step: 4, caption: "Hazard outbreak detected in center grid" });
            setHazards(prev => ({ ...prev, '10,10': 'fire', '9,10': 'fire' }));
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 1500));
            
            setDemoState({ step: 5, caption: "Rerouting rescuer unit to avoid hazards" });
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 2500));

            setDemoState({ step: 6, caption: "Gateway syncing logs to Command Dashboard" });
            const res = await fetch(`${API_URL}/sync-gateway`);
            const data = await res.json();
            setDashboardData(data);
            setShowDashboard(true);
            if (!demoRunningRef.current) return;
            await new Promise(r => setTimeout(r, 2000));
            
            setDemoState({ step: 7, caption: "Demo Complete!" });
            showToast("Demo complete! See dashboard for summary.");
        } catch (e) {
            console.error("Auto Demo Error:", e);
        } finally {
            setTimeout(stopAutoDemo, 3000);
        }
    };

    const handleGridClick = (x, y) => {
        if (hazardMode !== 'clear') {
            setHazards(prev => {
                const next = { ...prev };
                next[`${x},${y}`] = hazardMode;
                return next;
            });
        }
    };

    const triggerRandomSOS = () => {
        const aliveNodes = Object.values(nodesRef.current).filter(n => n.isAlive && n.role === 'survivor');
        if (aliveNodes.length > 0) {
            const target = aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
            triggerSOS(target.id);
            setSelectedTargetId(target.id);
        }
    };

    const killNodes = () => fetch(`${API_URL}/kill?pct=20`, { method: 'POST' }).then(() => addLog("Disaster strike: 20% nodes failed", "danger")).catch(()=>{});
    const reviveNodes = () => fetch(`${API_URL}/revive`, { method: 'POST' }).then(() => addLog("Revive All executed", "success")).catch(()=>{});
    const syncGateway = () => {
        fetch(`${API_URL}/sync-gateway`).then(res => res.json()).then(data => {
            setDashboardData(data);
            setShowDashboard(true);
            addLog(`Gateway synced ${data.logs.length} unique messages`, "info");
        }).catch(() => {});
    };

    const processAudioBuffer = (audioData, isClip = false) => {
        if (!yamnetModelRef.current) return;
        const frameSize = 15600;
        let offset = 0;
        const targetClasses = ['knock', 'shout', 'scream', 'cry', 'baby', 'infant', 'sob'];
        
        while (offset + frameSize <= audioData.length) {
            const frame = audioData.slice(offset, offset + frameSize);
            offset += 7800;

            tf.tidy(() => {
                const tensor = tf.tensor1d(frame);
                const outputs = yamnetModelRef.current.execute(tensor);
                
                let scoresTensor = Array.isArray(outputs) 
                    ? outputs.find(t => t.shape && t.shape.length === 2 && t.shape[1] === 521)
                    : (outputs.shape && outputs.shape[1] === 521 ? outputs : null);
                
                if (scoresTensor) {
                    const meanScores = tf.mean(scoresTensor, 0);
                    const scoresData = meanScores.dataSync();
                    
                    const now = Date.now();
                    if (!debugInfoRef.current || now - debugInfoRef.current.ts > 250) {
                        let topClasses = [];
                        let matched = null;
                        
                        const scoresArr = Array.from(scoresData).map((score, idx) => ({ score, name: yamnetClassesRef.current[idx] }));
                        scoresArr.sort((a, b) => b.score - a.score);
                        topClasses = scoresArr.slice(0, 3);
                        
                        for (let i = 0; i < scoresData.length; i++) {
                            const className = yamnetClassesRef.current[i];
                            if (scoresData[i] >= 0.3 && className && targetClasses.some(tc => className.toLowerCase().includes(tc))) {
                                matched = { type: className, confidence: scoresData[i] };
                                break;
                            }
                        }
                        
                        let sum = 0;
                        for(let i=0; i<frame.length; i++) sum += frame[i]*frame[i];
                        const rms = Math.sqrt(sum / frame.length);
                        
                        const newDebug = { rms, windowsProcessed: (debugInfoRef.current ? debugInfoRef.current.windowsProcessed : 0) + 1, topClasses, ts: now };
                        debugInfoRef.current = newDebug;
                        setDebugInfo(newDebug);
                        
                        if (matched) {
                            setRecentDetection({ ...matched, isClip, ts: Date.now() });
                            if (selectedTargetIdRef.current) {
                                fetch(`${API_URL}/sound/${selectedTargetIdRef.current}`, {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify(matched)
                                }).catch(console.error);
                            }
                        }
                    }
                }
            });
        }
    };

    useEffect(() => {
        if (aiMode !== 'live') {
            if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
            if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
            if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
            setModelStatus(aiMode === 'simulated' ? 'Simulated' : 'Off');
            setDebugInfo(null);
            debugInfoRef.current = null;
            setMicErrorNote('');
            return;
        }

        let isCancelled = false;
        setModelStatus('Loading AI...');

        const loadAI = async () => {
            try {
                if (!yamnetModelRef.current) {
                    yamnetModelRef.current = await tf.loadGraphModel("/models/yamnet/model.json");
                    const res = await fetch("/models/yamnet/class_map.csv");
                    const text = await res.text();
                    yamnetClassesRef.current = text.split('\n').slice(1).map(line => {
                        const parts = line.split(',');
                        return parts.length > 2 ? parts[2].trim() : null;
                    }).filter(Boolean);
                }
                if (isCancelled) return;
                
                setModelStatus('Listening...');
                
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
                await audioCtxRef.current.resume();
                
                const constraints = { 
                    audio: { 
                        echoCancellation: false, 
                        noiseSuppression: false, 
                        autoGainControl: false,
                        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {})
                    } 
                };
                
                micStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
                getAudioDevices(); 
                
                if (isCancelled) return;

                const source = audioCtxRef.current.createMediaStreamSource(micStreamRef.current);
                processorRef.current = audioCtxRef.current.createScriptProcessor(16384, 1, 1);
                const gainNode = audioCtxRef.current.createGain();
                gainNode.gain.value = 0;
                
                let buffer = [];
                let windowHistory = [];
                let silenceStart = Date.now();
                
                processorRef.current.onaudioprocess = (e) => {
                    const data = e.inputBuffer.getChannelData(0);
                    
                    let sum = 0;
                    for(let i=0; i<data.length; i++) sum += data[i]*data[i];
                    const rms = Math.sqrt(sum / data.length);
                    
                    if (rms < 0.0005) {
                        if (Date.now() - silenceStart > 3000) setMicErrorNote("No audio signal.");
                    } else {
                        silenceStart = Date.now();
                        setMicErrorNote('');
                    }

                    const ratio = audioCtxRef.current.sampleRate / 16000;
                    const resampled = [];
                    for(let i=0; i<data.length; i+=ratio) resampled.push(data[Math.floor(i)]);
                    buffer.push(...resampled);
                    
                    while (buffer.length >= 15600) {
                        const frame = buffer.slice(0, 15600);
                        buffer = buffer.slice(7800);
                        
                        tf.tidy(() => {
                            const tensor = tf.tensor1d(frame);
                            const outputs = yamnetModelRef.current.execute(tensor);
                            
                            let scoresTensor = Array.isArray(outputs) 
                                ? outputs.find(t => t.shape && t.shape.length === 2 && t.shape[1] === 521)
                                : (outputs.shape && outputs.shape[1] === 521 ? outputs : null);
                            
                            if (scoresTensor) {
                                const meanScores = tf.mean(scoresTensor, 0);
                                const scoresData = meanScores.dataSync();
                                
                                const now = Date.now();
                                if (!debugInfoRef.current || now - debugInfoRef.current.ts > 250) {
                                    let topClasses = [];
                                    let matched = null;
                                    const targetClasses = ['knock', 'shout', 'scream', 'cry', 'baby', 'infant', 'sob'];
                                    
                                    const scoresArr = Array.from(scoresData).map((score, idx) => ({ score, name: yamnetClassesRef.current[idx] }));
                                    scoresArr.sort((a, b) => b.score - a.score);
                                    topClasses = scoresArr.slice(0, 3);
                                    
                                    for (let i = 0; i < scoresData.length; i++) {
                                        const className = yamnetClassesRef.current[i];
                                        if (scoresData[i] >= 0.3 && className && targetClasses.some(tc => className.toLowerCase().includes(tc))) {
                                            matched = { type: className, confidence: scoresData[i] };
                                            break;
                                        }
                                    }
                                    
                                    const newDebug = { rms, windowsProcessed: (debugInfoRef.current ? debugInfoRef.current.windowsProcessed : 0) + 1, topClasses, ts: now };
                                    debugInfoRef.current = newDebug;
                                    setDebugInfo(newDebug);
                                    
                                    windowHistory.push(matched);
                                    if (windowHistory.length > 5) windowHistory.shift();
                                    
                                    if (windowHistory.length >= 2) {
                                        const last = windowHistory[windowHistory.length - 1];
                                        const prev = windowHistory[windowHistory.length - 2];
                                        if (last && prev && last.type === prev.type) {
                                            setRecentDetection({ ...last, isClip: false, ts: Date.now() });
                                            windowHistory = [];
                                            if (selectedTargetIdRef.current) {
                                                fetch(`${API_URL}/sound/${selectedTargetIdRef.current}`, {
                                                    method: 'POST',
                                                    headers: {'Content-Type': 'application/json'},
                                                    body: JSON.stringify(last)
                                                }).catch(console.error);
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                };
                source.connect(processorRef.current);
                processorRef.current.connect(gainNode);
                gainNode.connect(audioCtxRef.current.destination);

            } catch (err) {
                if (!errorLoggedRef.current) {
                    console.error("Live AI error:", err);
                    errorLoggedRef.current = true;
                    setModelStatus('Error');
                }
                setAiMode('off');
            }
        };

        loadAI();

        return () => {
            isCancelled = true;
            if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
            if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
            if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
        };
    }, [aiMode, selectedDeviceId, getAudioDevices]);

    const handleAudioClipUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const tempCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
            const data = audioBuffer.getChannelData(0);
            processAudioBuffer(data, true);
        } catch(err) {
            console.error(err);
        }
    };

    const processImageFile = async (file) => {
        setLastDamageFile(file);
        setIsUploading(true);
        setDamageResult(null);
        const formData = new FormData();
        formData.append('image', file);
        try {
            const res = await fetch(`${API_URL}/damage-upload/${selectedTargetId}`, { method: 'POST', body: formData });
            const data = await res.json();
            setDamageResult(data);
        } catch (err) {
            setDamageResult({ label: 'analysis unavailable', reason: 'Service busy, please retry' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleImageUpload = (e) => {
        if (!e.target.files || e.target.files.length === 0 || !selectedTargetId) return;
        processImageFile(e.target.files[0]);
    };

    const startDamageCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            cameraStreamRef.current = stream;
            setShowCamera(true);
            setTimeout(() => {
                if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
            }, 100);
        } catch (err) {
            console.error("Camera access denied:", err);
        }
    };

    const stopDamageCamera = () => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(track => track.stop());
            cameraStreamRef.current = null;
        }
        setShowCamera(false);
    };

    const captureDamagePhoto = () => {
        if (!cameraVideoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = cameraVideoRef.current.videoWidth;
        canvas.height = cameraVideoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cameraVideoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
            if (blob) {
                const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
                processImageFile(file);
            }
        }, 'image/jpeg');
        stopDamageCamera();
    };

    const rescueQueue = useMemo(() => {
        return nodes
            .filter(n => n.isAlive && n.role === 'survivor')
            .map(n => {
                const severity = n.severity ?? 0.5, people = n.people ?? 1, lastUpdateTs = n.lastUpdateTs ?? Date.now();
                let score = (weights.severity * severity) + (weights.people * (people / 20)) + 
                            (weights.battery * ((100 - n.battery) / 100)) + 
                            (weights.staleness * Math.min(1, (Date.now() - lastUpdateTs) / 120000));
                
                if (n.soundAlert && (Date.now() - n.soundAlert.ts < 20000)) score += 1.0; 
                if (n.damage === 'possible collapse risk') score += 2.0;
                else if (n.damage === 'major damage') score += 1.0;
                else if (n.damage === 'minor damage') score += 0.2;

                return { ...n, score };
            }).sort((a, b) => b.score - a.score);
    }, [nodes, weights]);

    const handleQueueClick = useCallback((n) => {
        setSelectedTargetId(n.id);
        if (mapRef.current) {
            mapRef.current.panTo([n.lat, n.lng], { animate: true });
            setHighlightEvent({ id: n.id, ts: Date.now() });
        }
    }, []);

    const activePathPositions = useMemo(() => {
        if (!selectedTargetId) return [];
        const targetNode = nodes.find(n => n.id === selectedTargetId);
        if (!targetNode) return [];

        const rescuers = nodes.filter(n => n.isAlive && n.role === 'rescuer');
        if (rescuers.length === 0) return [];

        let closestRescuer = null, minDist = Infinity;
        rescuers.forEach(r => {
            const dist = Math.hypot(r.lat - targetNode.lat, r.lng - targetNode.lng);
            if (dist < minDist) { minDist = dist; closestRescuer = r; }
        });

        if (closestRescuer) {
            const pathIndices = aStar(getGridCell(closestRescuer.lat, closestRescuer.lng), getGridCell(targetNode.lat, targetNode.lng), hazards);
            if (pathIndices) {
                const positions = pathIndices.map(p => getCellCenter(p[0], p[1]));
                positions.unshift([closestRescuer.lat, closestRescuer.lng]);
                positions.push([targetNode.lat, targetNode.lng]);
                return positions;
            }
        }
        return [];
    }, [selectedTargetId, hazards, nodes]);

    const gridRectangles = useMemo(() => {
        const rects = [];
        const density = {};
        let maxDensity = 0;
        nodes.forEach(n => {
            if (n.role === 'survivor' && n.isAlive) {
                const cell = getGridCell(n.lat, n.lng);
                const key = `${cell.x},${cell.y}`;
                density[key] = (density[key] || 0) + 1;
                if (density[key] > maxDensity) maxDensity = density[key];
            }
        });

        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                const hType = hazards[`${x},${y}`];
                const d = density[`${x},${y}`] || 0;
                
                let color = 'rgba(255,255,255,0.05)', fillColor = 'transparent', fillOpacity = 0, hazardClass = '';
                
                if (showHeatmap && d > 0) {
                    fillColor = 'var(--warning)'; 
                    fillOpacity = Math.max(0.1, (d / maxDensity) * 0.75);
                }
                
                if (hType === 'fire') { fillColor = 'var(--danger)'; fillOpacity = 0.5; hazardClass = 'pulse-cell'; }
                if (hType === 'gas') { fillColor = '#a855f7'; fillOpacity = 0.5; hazardClass = 'pulse-cell'; }
                if (hType === 'blocked') { fillColor = 'url(#hazard-stripe)'; fillOpacity = 0.8; }
                
                if (fillOpacity > 0 || color !== 'transparent') {
                    rects.push(
                        <Rectangle 
                            key={`${x},${y}`} 
                            bounds={[[MIN_LAT + y * CELL_H, MIN_LNG + x * CELL_W], [MIN_LAT + (y + 1) * CELL_H, MIN_LNG + (x + 1) * CELL_W]]} 
                            pathOptions={{ color, weight: 1, fillColor, fillOpacity, className: hazardClass }}
                            eventHandlers={{ click: () => handleGridClick(x, y) }}
                        />
                    );
                }
            }
        }
        return rects;
    }, [hazards, hazardMode, showHeatmap, nodes]);

    const aliveCount = nodes.filter(n => n.isAlive).length;
    const totalCount = nodes.length;
    const activeSosCount = rescueQueue.filter(n => (Date.now() - n.lastUpdateTs < 15000)).length;

    const avgHops = useMemo(() => {
        if (!dashboardData || !dashboardData.logs) return '-';
        const map = new Map();
        dashboardData.logs.forEach(msg => {
            if (!map.has(msg.id) || msg.flags.ttl > map.get(msg.id).flags.ttl) {
                map.set(msg.id, msg);
            }
        });
        const uniqueLogs = Array.from(map.values());
        if (uniqueLogs.length === 0) return '-';
        let totalHops = 0;
        uniqueLogs.forEach(msg => { totalHops += (8 - msg.flags.ttl); });
        return (totalHops / uniqueLogs.length).toFixed(1);
    }, [dashboardData]);

    const topSoundClass = debugInfo && debugInfo.topClasses && debugInfo.topClasses.length > 0 ? debugInfo.topClasses[0] : null;
    const isQuiet = !topSoundClass || topSoundClass.score < 0.15;
    const activeCategory = isQuiet ? { icon: <Square size={12}/>, name: 'Quiet / no clear sound', color: 'var(--text-muted)' } : getAudioCategory(topSoundClass.name);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <AnimatePresence>
                {showSplash && <Splash onComplete={() => setShowSplash(false)} />}
            </AnimatePresence>

            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--text)', color: '#000', padding: '10px 20px', borderRadius: '24px', fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {demoState && (
                    <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 15, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: '8px', background: 'rgba(7,11,20,0.9)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', alignItems: 'center' }}>
                        {['Reset', 'SOS', 'Fail', 'SOS', 'Hazard', 'Reroute', 'Sync', 'Done'].map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: demoState.step >= i ? 1 : 0.4 }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: demoState.step > i ? 'var(--success)' : (demoState.step === i ? 'var(--accent)' : 'var(--border)'), display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    {demoState.step > i && <Check size={10} color="#000" strokeWidth={3} />}
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text)' }}>{s}</span>
                                {i < 7 && <div style={{ width: '12px', height: '2px', background: 'var(--border)' }} />}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <pattern id="hazard-stripe" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="40" height="40" fill="#000000" fillOpacity="0.8" />
                        <rect width="20" height="40" fill="#f59e0b" fillOpacity="0.8" />
                    </pattern>
                </defs>
            </svg>
            
            <div style={{ padding: '15px 15px 5px 15px', display: 'flex', gap: '15px', alignItems: 'center', zIndex: 10 }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                    <Radio color="var(--accent)" /> MeshRescue
                </h2>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={triggerRandomSOS} className="btn btn-amber" disabled={isDemoRunning}><Activity size={14}/> Activate SOS</button>
                    <button onClick={killNodes} className="btn btn-red" disabled={isDemoRunning}><Skull size={14}/> Kill 20%</button>
                    <button onClick={reviveNodes} className="btn btn-green" disabled={isDemoRunning}><RefreshCw size={14}/> Revive All</button>
                    <button onClick={runAutoDemo} className="btn btn-purple">
                        {isDemoRunning ? <Square size={14} fill="#fff" /> : <PlayCircle size={14}/>} {isDemoRunning ? 'Stop Demo' : 'Auto Demo'}
                    </button>
                </div>
                
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <StatusPill isConnected={isAppLoaded} />
                    <button onClick={() => setShowHeatmap(!showHeatmap)} className={`btn btn-ghost ${showHeatmap ? 'active' : ''}`} style={{padding: '8px 12px', fontSize: '0.8rem'}}>
                        <Layers size={14}/> Toggle Heatmap
                    </button>
                    <button onClick={syncGateway} className="btn btn-accent" style={{padding: '8px 12px', fontSize: '0.8rem'}}>
                        <Wifi size={14}/> Reconnect Gateway
                    </button>
                </div>
            </div>
            
            <div style={{ margin: '10px 15px 0 15px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <StatCard title="Nodes Alive" value={`${aliveCount} / ${totalCount}`} color="var(--success)" tooltip="Total number of nodes currently alive in the mesh" isString={true} />
                <StatCard title="Active SOS" value={activeSosCount} color="var(--warning)" tooltip="Number of survivor nodes that broadcasted an SOS in the last 15s" />
                <StatCard title="Messages Relayed" value={stats.relayed} color="var(--accent)" tooltip="Total raw radio hop transmissions across the entire mesh network" />
                <StatCard title="Avg Delivery Hops" value={avgHops} isFloat={true} color="#ffffff" tooltip="Average hops of messages delivered to a gateway" />
            </div>

            <div style={{ flex: 1, display: 'flex', padding: '15px', gap: '15px', position: 'relative', minHeight: 0 }}>
                
                {/* Left Column */}
                <div className="panel-glass" style={{ width: '280px', display: 'flex', flexDirection: 'column', zIndex: 5 }}>
                    <div style={{ padding: '15px', borderBottom: '1px solid var(--border)' }}>
                        <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}><ActivitySquare size={16} color="var(--accent)"/> Mesh Health</h4>
                        <RingChart alive={aliveCount} total={totalCount} />
                    </div>
                    
                    <div style={{ flex: 1, padding: '15px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                                <span style={{color:'var(--accent)', fontWeight:'bold'}}>&gt;_</span> Live Event Log
                            </h4>
                            <Trash2 size={14} color="var(--text-muted)" cursor="pointer" onClick={() => setLocalLogs([])} />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            {localLogs.length === 0 && <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontStyle: 'italic'}}>Waiting for events...</div>}
                            <AnimatePresence initial={false}>
                                {localLogs.map(log => {
                                    let color = 'var(--text-muted)';
                                    if (log.type === 'warning') color = 'var(--warning)';
                                    if (log.type === 'danger') color = 'var(--danger)';
                                    if (log.type === 'success') color = 'var(--success)';
                                    return (
                                        <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} layout
                                            style={{ marginBottom: '8px', lineHeight: 1.3, color }}>
                                            <span style={{ opacity: 0.5, marginRight: '4px' }}>[{new Date(log.ts).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', second:'2-digit'})}]</span> {log.text}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                </div>

                {/* Center Column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: '10px' }}>
                    <div className="panel-glass" style={{ display: 'flex', gap: '8px', padding: '8px 15px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'hidden' }}>
                        <span style={{color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'}}>
                            <ShieldAlert size={14} /> Hazard Toolbar:
                        </span>
                        <button onClick={()=>{setHazardMode('clear');}} className={`btn-segment ${hazardMode==='clear' ? 'active' : ''}`}><XSquare size={14}/> Clear</button>
                        <button onClick={()=>setHazardMode('fire')} className={`btn-segment ${hazardMode==='fire' ? 'active-fire' : ''}`}><Flame size={14}/> Fire</button>
                        <button onClick={()=>setHazardMode('gas')} className={`btn-segment ${hazardMode==='gas' ? 'active-gas' : ''}`}><Wind size={14}/> Gas</button>
                        <button onClick={()=>setHazardMode('blocked')} className={`btn-segment ${hazardMode==='blocked' ? 'active-blocked' : ''}`}><Anchor size={14}/> Blocked</button>
                        
                        <div style={{ flex: 1 }} /> 
                        <button onClick={() => setShowHeatmap(!showHeatmap)} className={`btn-segment ${showHeatmap ? 'active' : ''}`}><Layers size={14}/> Heatmap</button>
                        <button onClick={syncGateway} className="btn-segment"><Wifi size={14}/> Gateway Logs</button>
                    </div>

                    <div className="panel-glass" style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '14px', minHeight: 0 }}>
                        <MapContainer ref={mapRef} center={[37.7749, -122.4194]} zoom={14} style={{ height: '100%', width: '100%' }} preferCanvas={true} zoomControl={false}>
                            <MapControls nodes={nodes} />
                            <MapBoundsFitter nodes={nodes} />
                            <Polygon 
                                positions={[
                                    [MAP_CENTER_LAT + 0.007, MAP_CENTER_LNG - 0.008],
                                    [MAP_CENTER_LAT + 0.008, MAP_CENTER_LNG + 0.004],
                                    [MAP_CENTER_LAT + 0.002, MAP_CENTER_LNG + 0.009],
                                    [MAP_CENTER_LAT - 0.005, MAP_CENTER_LNG + 0.004],
                                    [MAP_CENTER_LAT - 0.003, MAP_CENTER_LNG - 0.009]
                                ]} 
                                pathOptions={{ color: 'var(--text-muted)', weight: 2, dashArray: '5,10', fillOpacity: 0 }} 
                            />
                            {gridRectangles}
                            
                            {nodes.map(n => (
                                <CircleMarker 
                                    key={n.id} center={[n.lat, n.lng]} radius={10} opacity={0} fillOpacity={0}
                                    eventHandlers={{
                                        mouseover: () => setHoveredNode(n.id),
                                        mouseout: () => setHoveredNode(null),
                                        click: () => { setSelectedTargetId(n.id); setHighlightEvent({ id: n.id, ts: Date.now() }); }
                                    }}
                                >
                                    {hoveredNode === n.id && (
                                        <Tooltip permanent direction="top" offset={[0, -10]} opacity={1}>
                                            <div style={{fontFamily: 'Inter', fontSize: '0.75rem', lineHeight: '1.2'}}>
                                                <strong>{n.id}</strong><br/>
                                                <span style={{color: 'var(--text-muted)'}}>Role:</span> {n.role}<br/>
                                                <span style={{color: 'var(--text-muted)'}}>Battery:</span> {n.battery}%<br/>
                                                <span style={{color: 'var(--text-muted)'}}>Status:</span> {n.isAlive ? 'Alive' : 'Dead'}
                                            </div>
                                        </Tooltip>
                                    )}
                                    <Popup>
                                        <div style={{fontFamily: 'Inter', color: '#333'}}>
                                            <strong>{n.id}</strong><br/>
                                            Role: {n.role}<br/>
                                            Status: {n.isAlive ? '🟢 Alive' : '⚫ Dead'}<br/>
                                            Battery: {n.battery}%
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                            
                            {activePathPositions.length > 0 && (
                                <Polyline positions={activePathPositions} className="anim-marching-ants" pathOptions={{ color: 'var(--accent)', weight: 3, dashArray: '10, 10' }} />
                            )}
                            
                            <CanvasOverlay nodes={nodes} waves={waves} hoveredNode={hoveredNode} systemEvent={systemEvent} highlightEvent={highlightEvent} />
                        </MapContainer>
                        <Legend />
                        
                        <AnimatePresence mode="wait">
                            {demoState && demoState.caption && (
                                <motion.div key={demoState.step} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.3 }}
                                    style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '20px', border: '1px solid var(--accent)', boxShadow: '0 0 15px rgba(34,211,238,0.3)', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    {demoState.caption}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right Column */}
                <div style={{ width: '340px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 5, minHeight: 0 }}>
                    
                    {/* Rescue Queue */}
                    <div className="panel-glass" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '220px', overflow: 'hidden' }}>
                        <div style={{ padding: '15px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                                <Search size={16} color="var(--accent)"/> Rescue Queue
                                <div style={{ fontSize: '0.65rem', background: 'var(--surface)', padding: '2px 6px', borderRadius: '10px', color: 'var(--text-muted)' }}>{rescueQueue.length}</div>
                            </h4>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 10px 10px' }}>
                            {rescueQueue.length === 0 && <div style={{textAlign:'center', color:'var(--text-muted)', padding:'10px', fontSize:'0.8rem'}}>No survivors in queue yet</div>}
                            <AnimatePresence>
                                {rescueQueue.slice(0, 50).map((n, i) => (
                                    <QueueRow key={n.id} n={n} i={i} isTop={i === 0} isSelected={selectedTargetId === n.id} onClick={handleQueueClick} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* AI Detection Card */}
                    <div className="panel-glass" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '250px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                            <button onClick={() => setAiTab('audio')} className="btn-segment" style={{ flex: 1, borderBottom: aiTab === 'audio' ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0, opacity: aiTab === 'audio' ? 1 : 0.6 }}>
                                <Mic size={14} /> Audio <div style={{ width: 6, height: 6, borderRadius: '50%', background: aiMode === 'live' ? 'var(--success)' : (aiMode === 'simulated' ? 'var(--accent)' : 'var(--text-muted)') }} />
                            </button>
                            <button onClick={() => setAiTab('image')} className="btn-segment" style={{ flex: 1, borderBottom: aiTab === 'image' ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0, opacity: aiTab === 'image' ? 1 : 0.6 }}>
                                <Camera size={14} /> Image <div style={{ width: 6, height: 6, borderRadius: '50%', background: isUploading ? 'var(--accent)' : (damageResult ? 'var(--success)' : 'var(--text-muted)') }} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                            {/* Audio Tab Content */}
                            <div style={{ display: aiTab === 'audio' ? 'block' : 'none' }}>
                                <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '10px' }}>
                                    <button onClick={() => setAiMode('live')} className={`btn-segment ${aiMode === 'live' ? 'active' : ''}`} style={{flex: 1, padding: '6px'}}>Live AI</button>
                                    <div style={{ width: '1px', background: 'var(--border)' }} />
                                    <button onClick={() => setAiMode('simulated')} className={`btn-segment ${aiMode === 'simulated' ? 'active' : ''}`} style={{flex: 1, padding: '6px'}}>Simul.</button>
                                    <div style={{ width: '1px', background: 'var(--border)' }} />
                                    <button onClick={() => setAiMode('off')} className={`btn-segment ${aiMode === 'off' ? 'active-fire' : ''}`} style={{flex: 1, padding: '6px'}}>Off</button>
                                </div>
                                
                                {aiMode === 'live' && (
                                    <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)} style={{ width: '100%', padding: '6px 6px 6px 26px', textOverflow: 'ellipsis' }}>
                                                    {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                                                </select>
                                                <Mic size={12} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--text-muted)' }} />
                                            </div>
                                            <div style={{ width: '60px', height: '14px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <div style={{ width: `${debugInfo ? Math.min(100, debugInfo.rms * 1000) : 0}%`, background: 'var(--success)', height: '100%', transition: 'width 0.1s linear' }} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <label className="btn-segment" style={{ flex: 1, cursor: 'pointer', padding: '6px', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                                <Music size={12} /> Test with clip
                                                <input type="file" accept="audio/*" style={{display: 'none'}} onChange={handleAudioClipUpload} />
                                            </label>
                                            <button onClick={() => setIsDebugging(!isDebugging)} className={`btn-segment ${isDebugging ? 'active' : ''}`} style={{ padding: '6px', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                                Debug {isDebugging ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                            </button>
                                        </div>
                                        {micErrorNote && <div style={{ fontSize: '0.7rem', color: 'var(--warning)', padding: '0 4px' }}>⚠️ {micErrorNote}</div>}
                                    </div>
                                )}
                                
                                {aiMode === 'live' && (
                                    <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Now hearing: <span style={{opacity: 0.7}}>(info only)</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.75rem', color: activeCategory.color, border: `1px solid ${activeCategory.color}` }}>
                                                {activeCategory.icon} {isQuiet ? activeCategory.name : topSoundClass.name}
                                            </div>
                                            {!isQuiet && <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{(topSoundClass.score * 100).toFixed(0)}%</span>}
                                        </div>
                                        {!isQuiet && (
                                            <div style={{ width: '100%', background: 'var(--border)', height: '4px', borderRadius: '2px', marginTop: '8px' }}>
                                                <div style={{ width: `${topSoundClass.score * 100}%`, background: activeCategory.color, height: '100%', transition: 'width 0.2s linear' }} />
                                            </div>
                                        )}
                                        {!isQuiet && debugInfo && debugInfo.topClasses.length > 1 && (
                                            <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                {debugInfo.topClasses.slice(1,3).map((c, i) => (
                                                    <span key={i} style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>{c.name} {(c.score*100).toFixed(0)}%</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {aiMode === 'simulated' && (
                                    <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginBottom: '10px' }}>
                                        Simulated mode active
                                    </div>
                                )}

                                {aiMode !== 'off' && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '12px', borderRadius: '8px' }}>
                                        {!selectedTargetId ? <span style={{ color: 'var(--warning)' }}>⚠️ Select a node on map</span> : (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>Listening: <strong style={{color:'var(--text)'}}>{selectedTargetId}</strong></span>
                                                    {!recentDetection && <div className="waveform"><div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/></div>}
                                                </div>
                                                <div style={{ marginTop: '12px' }}>
                                                    {recentDetection ? (
                                                        <div style={{ borderLeft: '3px solid var(--danger)', paddingLeft: '10px' }}>
                                                            <div style={{ color: 'var(--text)', fontWeight: 'bold', fontSize: '0.9rem' }}>{recentDetection.type.toUpperCase()}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                                <div style={{ flex: 1, background: 'var(--border)', height: '4px', borderRadius: '2px' }}>
                                                                    <div style={{ width: `${recentDetection.confidence * 100}%`, background: 'var(--danger)', height: '100%' }} />
                                                                </div>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{(recentDetection.confidence * 100).toFixed(0)}%</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(recentDetection.ts).toLocaleTimeString()}</span>
                                                                <span className="badge badge-sim">{recentDetection.isClip ? 'CLIP' : (aiMode==='simulated' ? 'SIMULATED' : 'LIVE AI')}</span>
                                                            </div>
                                                        </div>
                                                    ) : <span style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>Awaiting detection events...</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <AnimatePresence>
                                    {isDebugging && debugInfo && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                            <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '10px', borderRadius: '8px' }}>
                                                <div>Processed: {debugInfo.windowsProcessed}</div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Image Tab Content */}
                            <div style={{ display: aiTab === 'image' ? 'block' : 'none' }}>
                                {!selectedTargetId ? (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>⚠️ Select a node</div>
                                ) : (
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <div style={{ color: 'var(--text-muted)', marginBottom: '10px', fontStyle: 'italic', fontSize: '0.7rem' }}>Reported by rescuer's camera.</div>
                                        {!showCamera ? (
                                            <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '10px' }}>
                                                {isMobile ? (
                                                    <label className="btn-segment" style={{ flex: 1, padding: '6px' }}>
                                                        <Camera size={14} /> Capture
                                                        <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: 'none' }} disabled={isUploading} />
                                                    </label>
                                                ) : (
                                                    <button onClick={startDamageCamera} className="btn-segment" style={{ flex: 1, padding: '6px' }} disabled={isUploading}>
                                                        <Camera size={14} /> Capture
                                                    </button>
                                                )}
                                                <div style={{ width: '1px', background: 'var(--border)' }} />
                                                <label className="btn-segment" style={{ flex: 1, padding: '6px' }}>
                                                    <Upload size={14} /> Upload
                                                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} disabled={isUploading} />
                                                </label>
                                            </div>
                                        ) : (
                                            <div style={{ marginBottom: '10px', background: '#000', borderRadius: '8px', position: 'relative', overflow: 'hidden' }}>
                                                <video ref={cameraVideoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
                                                <div style={{ position: 'absolute', bottom: '10px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                                    <button onClick={captureDamagePhoto} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '20px' }}>Take photo</button>
                                                    <button onClick={stopDamageCamera} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '20px', background: 'rgba(0,0,0,0.5)' }}>Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {isUploading && (
                                            <div className="shimmer" style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                <Cpu size={16}/> Analysing with Cloud AI...
                                            </div>
                                        )}
                                        
                                        {damageResult && !isUploading && (
                                            <div style={{ marginTop: '10px', background: 'var(--surface)', padding: '10px', borderRadius: '8px', borderLeft: damageResult.label === 'analysis unavailable' ? '4px solid var(--text-muted)' : (damageResult.label.includes('collapse') ? '4px solid var(--danger)' : '4px solid var(--warning)') }}>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    {lastDamageFile && <img src={URL.createObjectURL(lastDamageFile)} alt="thumb" style={{ width: '64px', height: '64px', borderRadius: '6px', objectFit: 'cover' }} />}
                                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div style={{ color: damageResult.label === 'analysis unavailable' ? 'var(--text-muted)' : (damageResult.label.includes('collapse') ? 'var(--danger)' : 'var(--warning)'), fontWeight: 'bold', textTransform: 'capitalize', fontSize: '0.85rem' }}>
                                                                {damageResult.label}
                                                            </div>
                                                            {damageResult.cached && <span style={{ background: 'var(--accent)', color: '#000', fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>CACHED</span>}
                                                        </div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                            "{damageResult.reason}"
                                                        </div>
                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Cpu size={10} /> Analysed by cloud AI</div>
                                                    </div>
                                                </div>
                                                {damageResult.label === 'analysis unavailable' && lastDamageFile && (
                                                    <button onClick={() => processImageFile(lastDamageFile)} className="btn-segment" style={{ marginTop: '8px', padding: '4px 8px', fontSize: '0.7rem', border: '1px solid var(--border)', borderRadius: '6px', width: '100%' }}>Retry</button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Gateway Dashboard Slide-over */}
                <AnimatePresence>
                    {showDashboard && (
                        <>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                                onClick={() => setShowDashboard(false)}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999 }} 
                            />
                            <motion.div 
                                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '480px', zIndex: 1000, overflowY: 'auto', background: '#0a0f1c', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.8)' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#0a0f1c', zIndex: 10, alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text)' }}><Wifi size={20} color="var(--accent)"/> Command Dashboard</h3>
                                    <button onClick={() => setShowDashboard(false)} className="btn btn-danger" style={{padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px'}}><XSquare size={16}/> Close</button>
                                </div>
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                                        <div className="panel-glass" style={{ padding: '15px', borderLeft: '4px solid var(--accent)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Unique Survivors</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>{dashboardData ? dashboardData.logs.filter(l => l.status === 'SOS').length : 0}</div>
                                        </div>
                                        <div className="panel-glass" style={{ padding: '15px', borderLeft: '4px solid var(--danger)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Sound Detections</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>{dashboardData ? dashboardData.logs.filter(l => l.status === 'SOUND').length : 0}</div>
                                        </div>
                                        <div className="panel-glass" style={{ padding: '15px', borderLeft: '4px solid var(--warning)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Structural Damages</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>{dashboardData ? dashboardData.logs.filter(l => l.status === 'DAMAGE').length : 0}</div>
                                        </div>
                                        <div className="panel-glass" style={{ padding: '15px', borderLeft: '4px solid #a855f7' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Grid Hazards</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>{Object.keys(hazards).length}</div>
                                        </div>
                                    </div>
                                    <h4 style={{ color: 'var(--text)', marginBottom: '10px' }}>Raw Synced Gossip Logs</h4>
                                    <div className="panel-glass" style={{ padding: 0, overflow: 'hidden' }}>
                                        <table className="dash-table">
                                            <thead><tr><th>Timestamp</th><th>Node ID</th><th>Event Type</th><th>Details</th></tr></thead>
                                            <tbody>
                                                {dashboardData && dashboardData.logs.map((log, i) => (
                                                    <tr key={i}>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(log.ts).toLocaleTimeString()}</td>
                                                        <td style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.8rem' }}>{log.nodeId}</td>
                                                        <td style={{ fontSize: '0.8rem' }}>
                                                            {log.status === 'SOUND' ? <span className="badge" style={{background: 'var(--danger)', color: '#fff'}}>{log.data.type.toUpperCase()}</span> : 
                                                            (log.status === 'DAMAGE' ? <span className="badge" style={{background: 'var(--warning)', color: '#000'}}>{log.data.label.toUpperCase()}</span> : 
                                                            <span className="badge" style={{background: 'var(--warning)', color: '#000'}}>SOS</span>)}
                                                        </td>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                            {nodesRef.current[log.nodeId] ? `Lat: ${nodesRef.current[log.nodeId].lat.toFixed(4)}, Lng: ${nodesRef.current[log.nodeId].lng.toFixed(4)}` : ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!dashboardData || dashboardData.logs.length === 0) && (
                                                    <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Waiting for events...</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
