(function () {
  "use strict";

  /* ----------------------------------------------------------------88
     1. SECURITY & API LAYER (HARDENED)
  ------------------------------------------------------------------- */

  const API_BASE_URL = "https://revpro.onrender.com";
  const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let heartbeatInterval = null;

  async function checkLicenseStatus() {
    const data = await chrome.storage.local.get([
      "userEmail",
      "licenseKey",
      "jwtToken",
    ]);

    initSidebarContainer();

    if (!data.jwtToken) {
      showSidebarLockScreen();
      return;
    }

    // 1. Local Check (Is the JWT expired by time?)
    const locallyValid = isTokenLocallyValid(data.jwtToken);
    if (!locallyValid) {
      await forceLogout("Session expired. Please log in again.");
      return;
    }

    // 2. Server Live Check
    const serverValid = await validateSession(data.jwtToken);
    if (serverValid) {
      startAnalyticsDashboard(); // No need to pass token here as we use storage
      startHeartbeat(data.jwtToken);
    } else {
      await forceLogout("Access inactive. Please check your membership.");
    }
  }

  function isTokenLocallyValid(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload.exp) return false;
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  async function validateSession(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/validate-token`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        console.error("Server validation failed status:", response.status);
        return false;
      }

      const result = await response.json();
      console.log("Validation heartbeat result:", result);
      return result.valid === true;
    } catch (err) {
      console.error("Validation network error:", err);
      return false;
    }
  }

  function startHeartbeat(token) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    heartbeatInterval = setInterval(async () => {
      const stillValid = await validateSession(token);
      if (!stillValid) {
        await forceLogout("License revoked or expired.");
      }
    }, HEARTBEAT_INTERVAL);
  }

  async function forceLogout(message) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    await chrome.storage.local.remove(["jwtToken", "licenseKey"]);
    showSidebarLockScreen(message);
  }

  async function verifyWithServer(email, license_key) {
    try {
      const response = await fetch(`${API_BASE_URL}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email, license_key }),
      });

      const result = await response.json();

      if (result.success && result.token) {
        await chrome.storage.local.set({
          userEmail: email,
          licenseKey: license_key,
          jwtToken: result.token,
        });
        location.reload();
      } else {
        showSidebarLockScreen(result.message || "Invalid Credentials");
      }
    } catch (err) {
      console.error("Verify error:", err);
      showSidebarLockScreen("Server error. Please try again later.");
    }
  }

  /* ----------------------------------------------------------------88
     2. UI COMPONENTS & STYLING
  ------------------------------------------------------------------- */
  function initSidebarContainer() {
    if (document.getElementById("jc-sidebar")) return;

    const style = document.createElement("style");
    style.innerHTML = `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500;700&family=Mansalva&display=swap');
          #jc-sidebar[data-theme="dark"] {
              --primary: #5a99d4; --success: #34c759; --warning: #0ac6ff;
              --bg: #000000; --card-bg: #1c1c1e; --text-main: #ffffff;
              --text-sub: #8e8e93; --border: #38383a; --peak-bg: #326328e2;
              --border-color: #34c759;
          }
          #jc-sidebar[data-theme="light"] {
              --primary: #5a99d4; --success: #28a745; --warning: #0071a4;
              --bg: #f5f5f7; --card-bg: #ffffff; --text-main: #1d1d1f;
              --text-sub: #86868b; --border: #d2d2d7; --peak-bg: #d4fcd2;
              --border-color: #34c759;
          }
              #jc-patreon-btn:hover {
    background: #1a1a1a;
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2);
  }
  #jc-patreon-btn:active {
    transform: translateY(0);
  }

  .status-tag.status-withdrawn {
    background: #6b7280; /* Grey color */
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: bold;
    text-transform: uppercase;
}
          
          #jc-sidebar {
              font-family: 'Inter', -apple-system, sans-serif;
              letter-spacing: -0.022em;
              position: fixed; top: 0; right: -520px; width: 480px; height: 100vh;
              background: var(--bg); color: var(--text-main); z-index: 10000;
              box-shadow: -10px 0 30px rgba(0,0,0,0.3); transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
              overflow-y: auto; border-left: 1px solid var(--border);
              scroll-behavior: smooth;
          }
          #jc-sidebar.open { right: 0; }
          .header-flex { padding: 20px; background: var(--card-bg); border-bottom: 1px solid var(--border); position: sticky; top:0; z-index: 100; }
          .controls { display: flex; gap: 10px; margin-top: 15px; }
          select, .toggle-btn { background: var(--bg); border: 1px solid var(--border); color: var(--text-main); padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600; flex: 1; }
          .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 20px; }
          .stat-card { background: var(--card-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--border); border-left: 6px solid var(--primary); }
          .stat-card.peak { border-left-color: #f59e0b; }
          .stat-card.avg { border-left-color: #a855f7; }
          .stat-card.frozen-total { border-left-color: var(--warning); }
          .stat-card.available-total { border-left-color: var(--success); }
          .stat-card.timer-card { border-left-color: #ef4444; cursor: pointer; transition: transform 0.2s; }
          .stat-card.timer-card:hover { transform: translateY(-2px); }
          .stat-label { font-size: 0.7rem; color: var(--text-sub); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; }
          .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.3rem; font-weight: 700; margin: 4px 0; display: flex; align-items: center; gap: 8px; }
          .month-section { margin-bottom: 25px; padding: 0 20px; }
          .month-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--primary); color: white; border-radius: 10px 10px 0 0; font-weight: 700; }
          .copy-btn { background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--card-bg); border-radius: 0 0 12px 12px; border: 1px solid var(--border); border-top: none; }
          .day-row { cursor: pointer; transition: background 0.2s; }
          .day-row:hover { background: var(--bg); opacity: 0.8; }
          td { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 0.9rem; }
          .peak-row { background-color: var(--peak-bg) !important; }
          .amount { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--success); text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
          .detail-row { display: none; background: var(--bg); }
          .detail-row.active { display: table-row; }
          .detail-container { padding: 10px 15px; border-top: 1px dashed var(--border); }
          .txn-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); opacity: 0.9; font-size: 0.82rem; }
          .txn-item b { font-family: 'JetBrains Mono', monospace; color: var(--text-sub); }
          .status-tag { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; margin-left: 8px; }
          .status-revenue { background: rgba(52, 199, 89, 0.2); color: var(--success); }
          .status-frozen { background: rgba(10, 169, 255, 0.2); color: var(--warning); }
          
          .next-unfreeze-highlight { 
              background: rgba(117, 209, 242, 0.15);
              animation: highlight-pulse 2s infinite ease-in-out;
              border-radius: 4px;
              padding: 4px;
          }
          @keyframes highlight-pulse {
            0% { box-shadow: 0 0 0px rgba(0, 157, 255, 0); }
            25% { box-shadow: 0 0 6px rgba(0, 157, 255, 0.25); }
            50% { box-shadow: 0 0 12px rgba(0, 157, 255, 0.4); }
            75% { box-shadow: 0 0 6px rgba(0, 157, 255, 0.25); }
            100% { box-shadow: 0 0 0px rgba(0, 157, 255, 0); }
          }

          .scroll-note-container { padding: 40px 20px 60px; text-align: center; }
          .marker-note { position: relative; display: inline-block; padding: 8px 18px; font-family: 'Mansalva', cursive; font-size: 14px; color: #fff; z-index: 1; }
          .marker-note::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #ff64b9; transform: rotate(-1.5deg) skew(-10deg); border-radius: 3px; box-shadow: 2px 2px 0px rgba(0,0,0,0.1); }
          #jc-toggle { position: fixed; bottom: 30px; right: 30px; z-index: 9999; width: auto; height: 50px; padding: 0 20px; display: flex; justify-content: center; align-items: center; gap: 10px; background: #5a99d4; color: white; border: none; border-radius: 12px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.02em; box-shadow: 0 0 0 0 rgba(90, 153, 212, 0.6); animation: pulse-rect 10s infinite; transition: transform 0.2s, background 0.2s; }
          #jc-toggle:hover { animation: none; transform: scale(1.05); background: #4a88c4; }
          #jc-toggle svg { width: 20px; height: 20px; stroke: currentColor; stroke-width: 2.5; fill: none; }
          @keyframes pulse-rect { 0% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(90, 153, 212, 0.7); } 7% { transform: scale(1.02); box-shadow: 0 0 0 15px rgba(90, 153, 212, 0); } 15% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(90, 153, 212, 0); } 100% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(90, 153, 212, 0); } }
      `;
    document.head.appendChild(style);

    const sidebar = document.createElement("div");
    sidebar.id = "jc-sidebar";
    sidebar.setAttribute("data-theme", "dark");
    document.body.appendChild(sidebar);

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "jc-toggle";
    toggleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span>Dashboard</span>
      `;
    document.body.appendChild(toggleBtn);
    toggleBtn.onclick = () => {
      sidebar.classList.toggle("open");
    };
  }

  function showSidebarLockScreen(msg = "Pro Access Required") {
    const sidebar = document.getElementById("jc-sidebar");
    sidebar.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px; box-sizing: border-box; text-align: center;">
        <h2 style="color:#6366f1; margin:0 0 10px 0; font-size:2rem; font-weight:800; letter-spacing:-0.04em;">Analytics Pro</h2>
        <p id="jc-status-msg" style="color:#8e8e93; font-size:0.95rem; margin-bottom:30px;">${msg}</p>
        <input type="text" id="jc-email-in" placeholder="Email Address" style="width:100%; padding:16px; margin:10px 0; border-radius:14px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:white; box-sizing:border-box; outline:none; font-size:1rem;">
        <input type="password" id="jc-key-in" placeholder="Access Key" style="width:100%; padding:16px; margin:10px 0; border-radius:14px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:white; box-sizing:border-box; outline:none; font-size:1rem;">
        
        <button id="jc-auth-btn" style="width:100%; padding:16px; background:#6366f1; border:none; border-radius:14px; color:white; font-weight:700; cursor:pointer; margin-top:20px; font-size:1rem; transition: 0.3s; box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);">Unlock Elite Access</button>
        
        <div style="width:100%; height:1px; background:rgba(255,255,255,0.1); margin: 25px 0;"></div>

       <a id="jc-patreon-btn" href="#" style="
    display: flex; 
    align-items: center; 
    justify-content: center; 
    gap: 12px; 
    width: 100%; 
    padding: 16px; 
    background: #000000; 
    border: 1px solid #333333;
    border-radius: 12px; 
    color: #ffffff; 
    font-weight: 600; 
    font-size: 0.95rem; 
    text-decoration: none;
    font-family: 'Inter', sans-serif;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 436 476" style="fill:currentColor;height:20px;width:20px;">
    
    <path d="M436 143c-.084-60.778-47.57-110.591-103.285-128.565C263.528-7.884 172.279-4.649 106.214 26.424 26.142 64.089.988 146.596.051 228.883c-.77 67.653 6.004 245.841 106.83 247.11 74.917.948 86.072-95.279 120.737-141.623 24.662-32.972 56.417-42.285 95.507-51.929C390.309 265.865 436.097 213.011 436 143Z"></path>
  </svg>
  Continue with Patreon
</a>

       <p style="margin-top:25px; font-size:0.85rem; color:#8e8e93;">
  Need access? 
  <a href="https://www.patreon.com/15413860/join" 
     target="_blank" 
     style="color:#6366f1; font-weight:600; text-decoration:none;">
     Join on Patreon
  </a>
</p>
      </div>`;

    document.getElementById("jc-auth-btn").onclick = () => {
      const email = document.getElementById("jc-email-in").value.trim();
      const key = document.getElementById("jc-key-in").value.trim();
      const btn = document.getElementById("jc-auth-btn");
      if (email && key) {
        btn.innerText = "Verifying...";
        btn.disabled = true;
        btn.style.opacity = "0.7";
        verifyWithServer(email, key);
      }
    };

    document.getElementById("jc-patreon-btn").onclick = (e) => {
      e.preventDefault();
      const width = 600,
        height = 700;
      const left = screen.width / 2 - width / 2,
        top = screen.height / 2 - height / 2;

      window.open(
        `${API_BASE_URL}/auth/patreon`,
        "PatreonLogin",
        `width=${width},height=${height},top=${top},left=${left}`,
      );

      const API_ORIGIN = new URL(API_BASE_URL).origin;

const handlePatreonMsg = async (event) => {
  // 1. Debugging - Check if the message even arrives
  console.log("Message received from:", event.origin);
  console.log("Data payload:", event.data);

  // 2. Relaxed Origin Check (ngrok origins can be finicky)
  if (!event.origin.includes("https://revpro.onrender.com")) return;

  if (event.data && event.data.type === "PATREON_SUCCESS") {
    console.log("Saving token and reloading...");
    await chrome.storage.local.set({
      jwtToken: event.data.token,
      userEmail: event.data.email,
      licenseKey: "PATREON_ACTIVE",
    });
    
    // Cleanup and Refresh
    window.removeEventListener("message", handlePatreonMsg);
    
    // Force a hard reload to trigger the dashboard logic
    window.location.href = window.location.href; 
  }

  if (event.data && event.data.type === "PATREON_ERROR") {
    const statusMsg = document.getElementById("jc-status-msg");
    if (statusMsg) statusMsg.innerText = event.data.message;
  }
};
      window.addEventListener("message", handlePatreonMsg);
    };
  }

  /* ----------------------------------------------------------------88
     3. DASHBOARD LOGIC (PRO)
  ------------------------------------------------------------------- */
function startAnalyticsDashboard() {
    const sidebar = document.getElementById("jc-sidebar");
    const COIN_ICON = "https://cdn.juicychat.ai/image/f_ca501aaf4e174413b5ae97d8f32b2992.png";
    const CONVERSION_RATE = 0.1;

    let openRows = new Set();
    let nextUnfreezeTimeout = null;
    let nextThawTimestamp = null;
    let nextThawDateId = null;
    let allWithdrawals = [];

    const logoUrl =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL("./logo.png")
            : "https://cdn-icons-png.flaticon.com/512/1162/1162456.png";

    // Insert Resize Handle at the start of the sidebar
    sidebar.innerHTML = `
          <div id="jc-resize-handle" style="position:absolute; left:0; top:0; width:6px; height:100%; cursor:ew-resize; z-index:10001; background: transparent;"></div>

          <div class="header-flex">
              <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                  <div style="display:flex; align-items:center; gap:12px;">
                      <img src="${logoUrl}" id="AppLogo" style="width:34px; height:34px; border-radius:8px;">
                      <h2 id="AppName" style="color:var(--text-main); font-size:1.4rem; font-weight:700; margin:0; letter-spacing:-0.03em;">Analytics Pro</h2>
                  </div>
                  <button id="jc-close" style="background:none; border:none; color:var(--text-sub); cursor:pointer; font-size:1.5rem;">&times;</button>
              </div>
              
              <div id="quick-stats-bar" style="display: flex; gap: 10px; margin-top: 15px; padding: 10px; background: var(--bg-card, rgba(255,255,255,0.03)); border-radius: 12px; border: 1px solid var(--border-color, rgba(128,128,128,0.1)); justify-content: space-around;">
                  <div style="text-align: center;">
                      <div style="font-size: 0.65rem; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.05em;">Gems Balance</div>
                      <div id="native-gems-val" style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">--</div>
                  </div>
                  <div style="width: 1px; background: var(--border-color, rgba(128,128,128,0.2)); height: 20px; align-self: center;"></div>
                  <div style="text-align: center;">
                      <div style="font-size: 0.65rem; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.05em;">App Earnings</div>
                      <div id="native-earnings-val" style="font-weight: 700; color: #fbbf24; font-size: 0.9rem;">--</div>
                  </div>
              </div>

              <div class="controls">
                  <select id="monthFilter"><option value="all">All Months</option><option value="last7">Last 7 Days</option></select>
                  <button id="themeToggle" class="toggle-btn">☀️ Light Mode</button>
              </div>
          </div>

          <div class="stats-grid">
              <div class="stat-card">
                  <div class="stat-label">Total Revenue 💰</div>
                  <div id="grandTotalUSD" class="stat-value">$0.00</div>
                  <div id="grandTotalCoins" style="font-size: 0.8rem; color: var(--text-sub);">0 Coins</div>
              </div>

              <div class="stat-card avg">
                  <div class="stat-label">Daily Average</div>
                  <div id="avgValue" class="stat-value">0</div>
                  <div id="avgUSD" style="font-size: 0.75rem; color: var(--text-sub);">$0.00 / day</div>
              </div>
              
              <div class="stat-card withdrawal-card" id="withdrawal-trigger" style="cursor:pointer; border: 1px solid var(--border-color, rgba(128,128,128,0.2)); background: var(--bg-card, rgba(255,255,255,0.05)); transition: transform 0.2s;">
                  <div class="stat-label">Total Withdrawn 💸</div>
                  <div id="withdrawnValue" class="stat-value">0</div>
                  <div id="withdrawnUSD" style="font-size: 0.75rem; color: var(--text-sub);">$0.00 Out</div>
                  <div style="font-size: 0.6rem; color: var(--success); margin-top:4px; opacity:0.8;">Click to view history →</div>
              </div>

              <div class="stat-card timer-card" id="unfreeze-trigger">
                  <div class="stat-label">Next Unfreeze 🧊</div>
                  <div id="countdownTimer" class="stat-value">--:--:--</div>
                  <div id="unfreezeDate" style="font-size: 0.7rem; color: #ef4444; font-weight: 700; margin-top: 2px;">Searching...</div>
                  <div id="unfreezeAmount" style="font-size: 0.75rem; color: var(--text-sub);">Scanning...</div>
              </div>

              <div class="stat-card available-total">
                  <div class="stat-label">Available Rev ✅</div>
                  <div id="availValue" class="stat-value">0</div>
                  <div id="availUSD" style="font-size: 0.75rem; color: var(--text-sub);">$0.00 Ready</div>
              </div>

              <div class="stat-card frozen-total">
                  <div class="stat-label">Frozen Total ❄️</div>
                  <div id="frozenValue" class="stat-value">0</div>
                  <div id="frozenUSD" style="font-size: 0.75rem; color: var(--text-sub);">$0.00 Frozen</div>
              </div>

              <div class="stat-card peak">
                  <div class="stat-label">Best Day Ever 🏆</div>
                  <div id="peakValue" class="stat-value">0</div>
                  <div id="peakDate" style="font-size: 0.75rem; color: var(--text-sub);">N/A</div>
              </div>
          </div>

          <div id="monthlyContainer"></div>
          <div class="scroll-note-container"><span class="marker-note">Data missing? Scroll the main page to the bottom!</span></div>

          <div id="withdrawalModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index:10000; transition: all 0.3s ease;">
              <div id="modalBox" style="background: rgba(25, 25, 25, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; max-width: 450px; width: 90%; margin: 80px auto; padding: 25px; color: #fff; font-family: sans-serif; position:relative;">
                  <button id="closeModal" style="position:absolute; right:20px; top:20px; background:rgba(255,255,255,0.1); border:none; width:32px; height:32px; border-radius:50%; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.2rem; transition: background 0.2s;">&times;</button>
                  <h3 style="margin:0; font-weight:700; letter-spacing:-0.02em; font-size:1.6rem; color:#fff;">Withdrawal History</h3>
                  <div id="modalContent" style="max-height:60vh; overflow-y:auto; scrollbar-width: none; margin-top:10px;"></div>
              </div>
          </div>
      `;

    // RESIZE LOGIC IMPLEMENTATION
    const resizeHandle = document.getElementById("jc-resize-handle");
    let isResizing = false;

    resizeHandle.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        // Sidebar is on the right, so dragging mouse left increases width
        const newWidth = window.innerWidth - e.clientX;
        // Limits: Min 350px, Max 80% of screen
        if (newWidth > 350 && newWidth < (window.innerWidth * 0.8)) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    window.addEventListener("mouseup", () => {
        isResizing = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
    });

    // START REVENUE LOGIC (EXACTLY AS PROVIDED)
    function formatTo12Hr(timeStr) {
        if (!timeStr) return "";
        let [hrs, mins] = timeStr.split(":").map(Number);
        const ampm = hrs >= 12 ? "PM" : "AM";
        hrs = hrs % 12 || 12;
        return `${hrs}:${mins.toString().padStart(2, "0")} ${ampm}`;
    }

    function getFormattedDateInfo(dateStr) {
        const parts = dateStr.split("/");
        const dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
        return {
            full: dateObj.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                weekday: "long",
            }),
            short: dateObj.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                weekday: "short",
            }),
            monthYear: dateObj.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
            }),
            timestamp: dateObj.getTime(),
        };
    }

    function startCountdown(targetDate, amount) {
        if (nextUnfreezeTimeout) clearInterval(nextUnfreezeTimeout);
        const timerDisplay = document.getElementById("countdownTimer");
        const amountDisplay = document.getElementById("unfreezeAmount");
        const dateDisplay = document.getElementById("unfreezeDate");
        if (!timerDisplay) return;
        const d = new Date(targetDate);
        dateDisplay.textContent = `On ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} @ ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
        amountDisplay.textContent = `+${amount.toLocaleString()} Coins arriving`;
        nextUnfreezeTimeout = setInterval(() => {
            const distance = targetDate - new Date().getTime();
            if (distance < 0) {
                timerDisplay.textContent = "Processing...";
                return;
            }
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            timerDisplay.textContent = `${days > 0 ? days + "d " : ""}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }, 1000);
    }

    function updateDashboard() {
        // Scrape native balance
        const nativeGems = document.querySelector("._gemsBalance_c207p_28 ._balanceNumL_c207p_51 span")?.innerText || "--";
        const nativeEarnings = document.querySelector("._gemsEarnings_c207p_29 ._balanceNumL_c207p_51 span")?.innerText || "--";
        
        const gemsEl = document.getElementById("native-gems-val");
        const earnEl = document.getElementById("native-earnings-val");
        if(gemsEl) gemsEl.innerText = nativeGems;
        if(earnEl) earnEl.innerText = nativeEarnings;

        const container = document.querySelector("div._listBox_c207p_211");
        if (!container) return;
        const items = container.querySelectorAll("div._listItem_c207p_230");
        const dailyData = {};
        let overallRevenue = 0,
            overallFrozen = 0,
            overallWithdrawn = 0,
            frozenTxns = [];
        
        allWithdrawals = [];

        items.forEach((item) => {
            const timeBox = item.querySelector("._itemTime_c207p_301");
            const fullText = timeBox?.textContent || "";
            const tzMatch = fullText.match(/UTC([+-]\d+(\.\d+)?)/);
            const offset = tzMatch ? parseFloat(tzMatch[1]) : 0;
            const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
            const timeMatch = fullText.match(/(\d{2}:\d{2})/);

            const isFrozen = item.classList.contains("_freezeItem_c207p_236") || item.innerText.includes("Frozen");

            if (dateMatch) {
                const dateStr = dateMatch[0];
                const timeStr = timeMatch ? timeMatch[0] : "00:00";
                const desc = item.querySelector("._itemDes_c207p_239")?.textContent || "Revenue";
                const isWithdrawal = desc.includes("Withdrawal");

                let val = 0;
                item.querySelectorAll("._itemBR_c207p_315 span").forEach((s) => {
                    const n = parseFloat(s.textContent.replace(/[^+0-9.-]/g, ""));
                    if (!isNaN(n)) val += n;
                });

                if (!dailyData[dateStr])
                    dailyData[dateStr] = {
                        total: 0,
                        frozen: 0,
                        txns: [],
                        info: getFormattedDateInfo(dateStr),
                    };

                let thawTs = null;
                if (isFrozen) {
                    const [m, d, y] = dateStr.split("/");
                    const [h, min] = timeStr.split(":");
                    const totalMinutes = parseInt(h) * 60 + parseInt(min) - offset * 60;
                    const utcTimestamp = Date.UTC(y, m - 1, d, 0, totalMinutes);
                    thawTs = utcTimestamp + 30 * 24 * 60 * 60 * 1000;
                    frozenTxns.push({ thawDate: thawTs, val, dateStr });
                }

                if (isWithdrawal) {
                    const absVal = Math.abs(val);
                    overallWithdrawn += absVal;
                    allWithdrawals.push({ date: dateStr, time: formatTo12Hr(timeStr), amount: absVal });
                } else {
                    dailyData[dateStr].total += val;
                    overallRevenue += val;
                    if (isFrozen) {
                        dailyData[dateStr].frozen += val;
                        overallFrozen += val;
                    }
                }

                dailyData[dateStr].txns.push({
                    time: formatTo12Hr(timeStr),
                    desc,
                    val: val,
                    isFrozen,
                    isWithdrawal,
                    thawTs,
                });
            }
        });

        if (frozenTxns.length > 0) {
            const soonest = frozenTxns
                .filter((t) => t.thawDate > Date.now())
                .sort((a, b) => a.thawDate - b.thawDate)[0];
            if (soonest) {
                nextThawTimestamp = soonest.thawDate;
                nextThawDateId = soonest.dateStr;
                startCountdown(soonest.thawDate, soonest.val);
            }
        }
        render(dailyData, overallRevenue, overallFrozen, nextThawTimestamp, overallWithdrawn);
    }

    function render(dailyData, grandCoins, grandFrozen, nextThawTimestamp, overallWithdrawn) {
        const container = document.getElementById("monthlyContainer");
        const filter = document.getElementById("monthFilter");
        if (!container || !filter) return;
        const currentFilter = filter.value || "all";
        container.innerHTML = "";
        let peakDate = "", peakVal = 0;
        const months = {};
        const sevenDaysAgo = new Date().setDate(new Date().getDate() - 7);

        Object.keys(dailyData).forEach((date) => {
            const dayInfo = dailyData[date].info;
            if (dailyData[date].total > peakVal) {
                peakVal = dailyData[date].total;
                peakDate = date;
            }
            let shouldInclude = true;
            if (currentFilter === "last7") {
                shouldInclude = dayInfo.timestamp >= sevenDaysAgo;
            } else if (currentFilter !== "all") {
                shouldInclude = dayInfo.monthYear === currentFilter;
            }

            if (shouldInclude) {
                const mKey = currentFilter === "last7" ? "Last 7 Days" : dayInfo.monthYear;
                if (!months[mKey]) months[mKey] = { days: [], total: 0, frozen: 0 };
                months[mKey].days.push({ date, ...dailyData[date] });
                months[mKey].total += dailyData[date].total;
                months[mKey].frozen += dailyData[date].frozen;
            }
        });

        let displayRevenue = currentFilter === "all" ? grandCoins : (months[currentFilter === "last7" ? "Last 7 Days" : currentFilter]?.total || 0);
        let displayFrozen = currentFilter === "all" ? grandFrozen : (months[currentFilter === "last7" ? "Last 7 Days" : currentFilter]?.frozen || 0);
        
        let availableRev = Math.max(0, displayRevenue - displayFrozen);

        let daysCount = currentFilter === "all" ? Object.keys(dailyData).length : (months[currentFilter === "last7" ? "Last 7 Days" : currentFilter]?.days.length || 0);
        const avgCoins = daysCount > 0 ? Math.round(displayRevenue / daysCount) : 0;

        document.getElementById("grandTotalUSD").textContent = (displayRevenue * CONVERSION_RATE).toLocaleString("en-US", { style: "currency", currency: "USD" });
        document.getElementById("grandTotalCoins").textContent = `${displayRevenue.toLocaleString()} Coins ${currentFilter === "all" ? "Total" : "Selected"}`;
        
        document.getElementById("avgValue").innerHTML = `<img src="${COIN_ICON}" style="width:18px;margin-right:5px;"> ${avgCoins.toLocaleString()}`;
        document.getElementById("avgUSD").textContent = `$${(avgCoins * CONVERSION_RATE).toFixed(2)} / day`;
        
        document.getElementById("frozenValue").innerHTML = `<img src="${COIN_ICON}" style="width:18px;margin-right:5px;"> ${displayFrozen.toLocaleString()}`;
        document.getElementById("frozenUSD").textContent = `$${(displayFrozen * CONVERSION_RATE).toFixed(2)} Frozen`;
        
        document.getElementById("availValue").innerHTML = `<img src="${COIN_ICON}" style="width:18px;margin-right:5px;"> ${availableRev.toLocaleString()}`;
        document.getElementById("availUSD").textContent = `$${(availableRev * CONVERSION_RATE).toFixed(2)} Available`;
        
        document.getElementById("peakValue").innerHTML = `<img src="${COIN_ICON}" style="width:20px;margin-right:8px;"> ${peakVal.toLocaleString()}`;
        document.getElementById("peakDate").textContent = peakDate ? getFormattedDateInfo(peakDate).full : "N/A";

        document.getElementById("withdrawnValue").innerHTML = `<img src="${COIN_ICON}" style="width:18px;margin-right:5px;"> ${overallWithdrawn.toLocaleString()}`;
        document.getElementById("withdrawnUSD").textContent = `$${(overallWithdrawn * CONVERSION_RATE).toFixed(2)} Total Withdrawn`;

        Object.keys(months)
            .sort((a, b) => (b === "Last 7 Days" ? 1 : new Date(b) - new Date(a)))
            .forEach((mKey) => {
                if (mKey !== "Last 7 Days" && ![...filter.options].some((o) => o.value === mKey)) {
                    const opt = document.createElement("option");
                    opt.value = mKey;
                    opt.textContent = mKey;
                    filter.appendChild(opt);
                }
                const section = document.createElement("div");
                section.className = "month-section";
                section.innerHTML = `
          <div class="month-header"><span>${mKey}</span><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:0.8rem">Total: $${(months[mKey].total * CONVERSION_RATE).toFixed(2)}</span><button class="copy-btn" data-m="${mKey}" data-t="${months[mKey].total}">📋 Copy</button></div></div>
          <table><tbody>${months[mKey].days
                        .sort((a, b) => b.info.timestamp - a.info.timestamp)
                        .map(
                            (day) => `
            <tr class="day-row ${day.date === peakDate ? "peak-row" : ""}" data-id="${day.date}" id="row-${day.date}">
                <td style="font-weight: 600;">▶ ${day.info.short}</td>
                <td class="amount"><img src="${COIN_ICON}" style="width:14px;">${day.total.toLocaleString()} <span style="color:var(--text-sub); font-size:0.75rem; font-weight:normal;">($${(day.total * CONVERSION_RATE).toFixed(2)})</span></td>
            </tr>
            <tr class="detail-row ${openRows.has(day.date) ? "active" : ""}" id="det-${day.date}">
                <td colspan="2"><div class="detail-container">${day.txns
                                    .map(
                                        (t) => `
                    <div class="txn-item ${t.thawTs === nextThawTimestamp ? "next-unfreeze-highlight" : ""}" ${t.thawTs === nextThawTimestamp ? 'id="target-unfreeze"' : ""}>
                        <span><b>${t.time}</b> ${t.desc} 
                            <span class="status-tag ${t.isWithdrawal ? "status-withdrawn" : (t.isFrozen ? "status-frozen" : "status-revenue")}">
                                ${t.isWithdrawal ? "Withdrawal 💸" : (t.isFrozen ? (t.thawTs === nextThawTimestamp ? "Next Unfreeze 🧊" : "Frozen") : "Revenue")}
                            </span>
                        </span>
                        <span style="color:${t.isWithdrawal ? "var(--text-sub)" : (t.isFrozen ? "var(--warning)" : "var(--success)")}; font-weight:700;">
                            ${t.isWithdrawal ? "-" : "+"}${Math.abs(t.val)}
                        </span>
                    </div>`,
                                    )
                                    .join("")}</div></td>
            </tr>`,
                        )
                        .join("")}</tbody></table>`;
                container.appendChild(section);
            });
    }

    // Modal Interaction
    document.getElementById("withdrawal-trigger").onclick = () => {
        const modal = document.getElementById("withdrawalModal");
        const modalContent = document.getElementById("modalContent");
        modal.style.display = "block";
        
        if (allWithdrawals.length === 0) {
            modalContent.innerHTML = "<p style='text-align:center; padding: 40px; opacity:0.6; color:#ccc;'>No withdrawals found.</p>";
            return;
        }

        modalContent.innerHTML = `
            <div style="margin-top:20px;">
                ${allWithdrawals.map(w => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <div>
                            <div style="font-weight:600; font-size:1rem; color: #ffffff;">${w.date}</div>
                            <div style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${w.time}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color: #ffffff;"><img src="${COIN_ICON}" style="width:14px; margin-right:4px;">${w.amount.toLocaleString()}</div>
                            <div style="font-size:0.75rem; color: #10b981; font-weight:600;">$${(w.amount * CONVERSION_RATE).toFixed(2)} USD</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    document.getElementById("closeModal").onclick = () => {
        document.getElementById("withdrawalModal").style.display = "none";
    };

    window.onclick = (event) => {
        const modal = document.getElementById("withdrawalModal");
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    document.getElementById("unfreeze-trigger").onclick = () => {
        if (!nextThawDateId) return;
        const det = document.getElementById(`det-${nextThawDateId}`);
        const target = document.getElementById("target-unfreeze");
        if (det && target) {
            det.classList.add("active");
            openRows.add(nextThawDateId);
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    };

    sidebar.addEventListener("click", (e) => {
        const row = e.target.closest(".day-row");
        if (row) {
            const id = row.dataset.id;
            const det = document.getElementById(`det-${id}`);
            det.classList.toggle("active");
            det.classList.contains("active") ? openRows.add(id) : openRows.delete(id);
            return;
        }
        if (e.target.classList.contains("copy-btn")) {
            const text = `Summary: ${e.target.dataset.m}\nCoins: ${e.target.dataset.t}\nUSD: $${(e.target.dataset.t * CONVERSION_RATE).toFixed(2)}`;
            navigator.clipboard.writeText(text).then(() => alert("Copied!"));
        }
    });

    document.getElementById("themeToggle").onclick = () => {
        const next = sidebar.getAttribute("data-theme") === "light" ? "dark" : "light";
        sidebar.setAttribute("data-theme", next);
        document.getElementById("themeToggle").innerText = next === "light" ? "🌙 Night Mode" : "☀️ Light Mode";
    };

    document.getElementById("monthFilter").onchange = () => updateDashboard();
    document.getElementById("jc-close").onclick = () => sidebar.classList.remove("open");

    updateDashboard();
    setInterval(() => {
        if (sidebar.classList.contains("open")) updateDashboard();
    }, 5000);
}

// TRIGGER LOGIC: Only open when button is pressed
document.addEventListener("click", (e) => {
    // Check if clicked element or its parent contains the text "Analytics Pro" 
    // This targets your specific app entry button
    if (e.target.innerText && e.target.innerText.includes("Analytics Pro")) {
        const sidebar = document.getElementById("jc-sidebar");
        if (sidebar) {
            sidebar.classList.add("open");
            // Only initialize the content if it's currently empty or needs a fresh start
            startAnalyticsDashboard();
        }
    }
});
 
  /* ----------------------------------------------------------------88
     4. INIT
  ------------------------------------------------------------------- */

  if (window.location.href.includes("juicychat.ai/my-wallet")) {
    checkLicenseStatus();
  }
})();

/**
 * 🧊 LIQUID GLASS ORB MODULE 🧊
 * Glassmorphism + Magnetic Drag + Double-Click Engine
 */
(function() {
    // 1. Advanced Glassmorphism & Fluid Animations
     const logoUrl =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL("./logo.png")
            : "https://cdn-icons-png.flaticon.com/512/1162/1162456.png";

    const orbStyles = document.createElement('style');
    orbStyles.id = "mango-orb-styles";
    orbStyles.innerHTML = `
        @keyframes orbPulse {
            0% { transform: scale(1); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
            50% { transform: scale(1.05); box-shadow: 0 0 20px 5px rgba(124, 58, 237, 0.5); }
            100% { transform: scale(1); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
        }

        .glass-orb-container {
            position: fixed;
            bottom: 50px;
            right: 100px;
            z-index: 2147483647;
            display: none;
            align-items: center;
            justify-content: center;
            user-select: none;
            touch-action: none;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
        }

        /* The Main Circular Orb */
        .glass-orb {
            width: 80px;
            height: 80px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px) saturate(160%) brightness(1.2);
            -webkit-backdrop-filter: blur(20px) saturate(160%) brightness(1.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: grab;
            transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }

        .glass-orb:active { cursor: grabbing; transform: scale(0.9); }

        .glass-orb span { font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); }

        /* The Tooltip Pill */
        .orb-label {
            position: absolute;
            right: 90px;
            background: rgba(0, 0, 0, 0.6);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            opacity: 0;
            transform: translateX(20px);
            transition: all 0.3s ease;
            pointer-events: none;
            backdrop-filter: blur(5px);
        }

        .glass-orb-container:hover .orb-label {
            opacity: 1;
            transform: translateX(0);
        }

        .orb-active {
            animation: orbPulse 2s infinite ease-in-out;
            background: rgba(124, 58, 237, 0.2) !important;
            border-color: rgba(124, 58, 237, 0.6) !important;
        }

        .orb-show { display: flex !important; }
    `;
    document.head.appendChild(orbStyles);

    // 2. Create the Orb Structure
    const container = document.createElement("div");
    container.className = "glass-orb-container";
    container.id = "mango-orb-root";

    const label = document.createElement("div");
    label.className = "orb-label";
    label.innerText = "Double Click to Auto-Load";

    const orb = document.createElement("div");
    orb.className = "glass-orb";
    orb.innerHTML = `<span><img src="${logoUrl}" id="AppLogo" style="width:64px; height:64px; border-radius:8px;"></span>`;

    container.appendChild(label);
    container.appendChild(orb);
    document.body.appendChild(container);

    let isScrolling = false;

    // --- DRAG LOGIC (Smooth & Precise) ---
    let isDragging = false;
    let startX, startY;

    orb.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX - container.offsetLeft;
        startY = e.clientY - container.offsetTop;
        orb.style.transition = 'none'; 
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        container.style.left = (e.clientX - startX) + 'px';
        container.style.top = (e.clientY - startY) + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        orb.style.transition = 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
    });

    // --- DASHBOARD TRIGGER ---
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target.id === 'jc-toggle' || target.closest('#jc-toggle')) {
            container.classList.add('orb-show');
        }
        if (target.id === 'jc-close' || target.closest('#jc-close')) {
            isScrolling = false;
            container.classList.remove('orb-show');
        }
    });

    // --- THE ENGINE (Double Click) ---
    orb.ondblclick = async () => {
        if (isScrolling) {
            isScrolling = false;
            orb.innerHTML = `<span><img src="${logoUrl}" id="AppLogo" style="width:64px; height:64px; border-radius:8px;"></span>`;
            orb.classList.remove('orb-active');
            label.innerText = "Double Click to Auto-Load";
            return;
        }

        const scrollTarget = document.getElementById("detailLayoutScrollViewId");
        if (!scrollTarget) {
            label.innerText = "⚠️ List not found!";
            return;
        }

        isScrolling = true;
        orb.innerHTML = `<span>⃠</span>`;
        orb.classList.add('orb-active');
        label.innerText = "Scrolling History...";

        while (isScrolling) {
            let lastHeight = scrollTarget.scrollHeight;
            scrollTarget.scrollTo({ top: scrollTarget.scrollHeight, behavior: 'smooth' });
            
            await new Promise(r => setTimeout(r, 1200));
            
            // Interaction Nudge
            scrollTarget.scrollTop -= 10;
            await new Promise(r => setTimeout(r, 100));
            scrollTarget.scrollTop += 10;

            await new Promise(r => setTimeout(r, 1500)); 

            if (scrollTarget.scrollHeight === lastHeight) {
                await new Promise(r => setTimeout(r, 2000));
                if (scrollTarget.scrollHeight === lastHeight) {
                    isScrolling = false;
                    break;
                }
            }
        }

        orb.innerHTML = `<span>✅</span>`;
        orb.classList.remove('orb-active');
        label.innerText = "History Fully Loaded";
        setTimeout(() => {
            orb.innerHTML = `<span><img src="${logoUrl}" id="AppLogo" style="width:64px; height:64px; border-radius:8px;"></span>`;
            label.innerText = "Double Click to Auto-Load";
        }, 3000);
    };
})();



console.log("[Analytics Pro] Extension injected successfully.");
