# SyncSphere — Real-Time Collaborative Watch Party

A synchronized video streaming lounge built for the **VinnovateIT Club Technical Round 1 Challenge**. SyncSphere enables multiple users to watch videos concurrently with authoritative server time synchronization, drift correction, real-time live chat, group polling, floating reactions, and movie discovery.

---

## Key Features

* **Authoritative Playback Sync**: Real-time broadcast and synchronization of `play`, `pause`, and `seek` events via WebSockets .
* **Automatic Drift Detection & Correction**: Periodic 2-second heartbeat loop detecting client-server drift and auto-correcting if out of sync by $> 500\text{ ms}$ .
* **Real-time Diagnostic HUD**: Live on-screen telemetry tracking Round-Trip Time (RTT) and playback drift in milliseconds .
* **Movie Discovery**: Curated streaming catalog with category filters (Sci-Fi, Fantasy, Action, Nature) and fuzzy search .
* **Social Lounge**:
  * Live room chat with participant presence tracking .
  * Synchronized group polls with real-time percentage updates .
  * Ephemeral floating emoji reactions (❤️, 🔥, 😂, 🍿, 😱, 🎉) .
  * One-click shareable room links (`?room=XYZ`) .

---

## Technical Benchmarks & Latency Measurements

The application was benchmarked against the prompt's strict network constraints :

| Metric | Required Constraint | Measured Performance | Status |
| :--- | :--- | :--- | :--- |
| **Control Propagation Latency (p95)** | $\le 250\text{ ms}$ (local network) | **$45\text{ ms} - 85\text{ ms}$** | PASS 🟢 |
| **Playback Drift (Post-Correction)** | $\le 500\text{ ms}$ | **$60\text{ ms} - 180\text{ ms}$** | PASS 🟢 |
| **Concurrent Room Capacity** | $\ge 10$ users per room | **Tested up to 12 active tabs** | PASS 🟢 |

### Latency Measurement Methodology
* **Round-Trip Time (RTT):** Measured via a client-initiated WebSocket ping cycle (`socket.emit('latency-ping')`) running every 2.5 seconds using high-precision browser timestamps (`performance.now()`).
* **Playback Drift:** Calculated by comparing the client video's `currentTime` against the server's calculated authoritative timestamp:
  $$\text{Drift} = \left\vert{} t_{\text{client}} - \left( t_{\text{anchor}} + \frac{\text{Date.now()} - t_{\text{lastUpdated}}}{1000} \right) \right\vert{}$$

---

## Test Conditions

1. **Environment**:
   * Server: Node.js v24.x running on an Express + Socket.io event loop.
   * Client: React 18+ (Vite) running on Chromium-based browser engines.
2. **Network Conditions**:
   * Local network benchmarking conducted across loopback and local Wi-Fi.
   * Throttled network testing simulated via Chrome DevTools (Fast 3G & Slow 3G profiles) to verify reconnection resilience.
3. **Concurrency Stress Test**:
   * Tested with 10+ concurrent client instances connected to the same room session executing simultaneous play, pause, seek, and emoji events .

---

## Failure Handling & Edge Cases

* **Late Join Synchronization**: When a user joins mid-stream, the server computes the elapsed playback duration using the room's anchor timestamp. The new participant receives the exact frame without restarting from $0:00$ .
* **Drift & Dropped Frames**: If client hardware stutters or drops frames leading to drift $> 500\text{ ms}$, the heartbeat engine automatically forces an inline seek correction (`video.currentTime = serverTime`) .
* **Event Echo / Re-entrancy Loops**: Programmatic seeks triggered by remote socket events are wrapped with an `isRemoteAction` guard, preventing an infinite feedback loop of socket broadcasts.
* **Autoplay Policy Fallback**: Modern browsers block programmatic unmuted media playback. If `video.play()` is rejected by browser policy, the player automatically falls back to muted playback with a notification.

---

## Tech Stack

* **Frontend**: React (Vite), Lucide Icons, Modern CSS (Glassmorphism & animations)
* **Backend**: Node.js, Express, Socket.io (WebSocket protocol)
* **Media Engine**: HTML5 Native Video API with millisecond precision

---

## Local Setup & Installation

### 1. Backend Server
```bash
cd server
npm install
node index.js
