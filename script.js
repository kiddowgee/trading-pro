tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                pro: {
                    bg: '#05080e',
                    panel: '#0a0f18',
                    card: '#0f1624',
                    border: '#1a2436',
                    hover: '#222f46',
                    blue: '#2563eb',
                    gold: '#d97706',
                    emerald: '#059669',
                    rose: '#e11d48'
                }
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace']
            }
        }
    }
};

let currentChartAsset = 'XAUUSD';
let currentSignal15mAsset = 'XAUUSD';
let currentSignal5mAsset = 'XAUUSD';
let globalUsdZarRate = 18.50;
let activeTradeDirection = 'BUY';
let activeOpenTrade = null;
let tradeTrackerInterval = null;

// User Account & Broker Engine Inputs
let userAccountBalance = 10000.00;
let userRiskPercent = 2.0;          // Max % willing to lose per session
let userTargetProfitPercent = 4.0;  // Target % profit per session
let userTradesPerSession = 2;        // Split trades per session
let userCustomLotSize = 0.10;       // Lot size preferred by user

let pendingSignal = null;
let activeSignalDrawing = null;

// Exness & Vault Markets Broker Specifications
const assetSpecs = {
    'XAUUSD': {
        name: 'XAUUSD — GOLD SPOT (Exness/Vault)',
        tvSymbol: 'OANDA:XAUUSD',
        basePrice: 4140.52,
        contractSize: 100,        // 1 Lot = 100 Troy Oz
        pipSize: 0.10,            // 1 Pip = $0.10
        dec: 2,
        minLot: 0.01
    },
    'EURUSD': {
        name: 'EURUSD — EURO / US DOLLAR (Exness/Vault)',
        tvSymbol: 'FX:EURUSD',
        basePrice: 1.12481,
        contractSize: 100000,     // 1 Lot = 100,000 Units
        pipSize: 0.0001,          // 1 Pip = 0.0001
        dec: 5,
        minLot: 0.01
    },
    'US100': {
        name: 'NAS100 — NASDAQ 100 INDEX (Exness/Vault)',
        tvSymbol: 'CAPITALCOM:US100',
        basePrice: 30789.20,
        contractSize: 1,          // 1 Lot = $1 per index point
        pipSize: 1.00,            // 1 Index Point = $1.00
        dec: 2,
        minLot: 0.01
    }
};

let livePrices = {
    'XAUUSD': 4140.52,
    'EURUSD': 1.12481,
    'US100': 30789.20
};

const liveEconomicEvents = [
    { id: 1, title: 'US Non-Farm Payrolls (NFP)', time: '14:30 SAST', date: 'Fri 02 Oct 2026', impact: 'HIGH', currency: 'USD', forecast: '185K', previous: '142K' },
    { id: 2, title: 'US Consumer Price Index (CPI YoY)', time: '14:30 SAST', date: 'Wed 07 Oct 2026', impact: 'HIGH', currency: 'USD', forecast: '2.5%', previous: '2.9%' },
    { id: 3, title: 'FOMC Interest Rate Decision', time: '20:00 SAST', date: 'Wed 14 Oct 2026', impact: 'HIGH', currency: 'USD', forecast: '4.75%', previous: '5.00%' }
];

let sampleJournalLogs = [];

function formatZar(value) {
    return `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isMarketOpen() {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 21) return false;
    return true;
}

function updateMarketStatusIndicator() {
    const badge = document.getElementById('marketStatusBadge');
    if (!badge) return;
    const open = isMarketOpen();
    badge.innerText = open ? 'MARKETS LIVE' : 'MARKETS CLOSED (WEEKEND)';
    badge.className = open 
        ? 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
}

// Master Account Capital & Risk Parameter Listener
function updateAccountCapitalAndRisk() {
    const balInput = parseFloat(document.getElementById('userBalanceInput')?.value);
    const riskInput = parseFloat(document.getElementById('userRiskPercentInput')?.value);
    const targetInput = parseFloat(document.getElementById('userTargetProfitInput')?.value);
    const tradesInput = parseInt(document.getElementById('userTradesPerSessionInput')?.value);
    const lotInput = parseFloat(document.getElementById('userLotSizeInput')?.value);

    if (!isNaN(balInput) && balInput > 0) userAccountBalance = balInput;
    if (!isNaN(riskInput) && riskInput > 0) userRiskPercent = riskInput;
    if (!isNaN(targetInput) && targetInput > 0) userTargetProfitPercent = targetInput;
    if (!isNaN(tradesInput) && tradesInput > 0) userTradesPerSession = tradesInput;
    if (!isNaN(lotInput) && lotInput >= 0.01) userCustomLotSize = lotInput;

    const headerDisplay = document.getElementById('displayUserBalance');
    if (headerDisplay) headerDisplay.innerText = formatZar(userAccountBalance);

    calculateBrokerRecommendations();
    render15mSignalPage();
    render5mSignalPage();
}

// Exness & Vault Markets Position & SL/TP Recommender Engine
function calculateBrokerRecommendations() {
    const spec = assetSpecs[currentChartAsset];
    const currentPrice = livePrices[currentChartAsset];

    // Capital & Risk Breakdown
    const totalSessionRiskZar = userAccountBalance * (userRiskPercent / 100);
    const totalSessionTargetZar = userAccountBalance * (userTargetProfitPercent / 100);

    const singleTradeRiskZar = totalSessionRiskZar / userTradesPerSession;
    const singleTradeTargetZar = totalSessionTargetZar / userTradesPerSession;

    const singleTradeRiskUsd = singleTradeRiskZar / globalUsdZarRate;
    const singleTradeTargetUsd = singleTradeTargetZar / globalUsdZarRate;

    // Recommendation Mode: User Lot vs Capital Derived Lot
    let lotToUse = userCustomLotSize;
    
    // Compute required Price Distance (in Asset Price Units) based on Lot Size & Contract Multiplier
    // Profit/Loss USD = Price Delta * Lot Size * Contract Size
    const priceDeltaForLoss = singleTradeRiskUsd / (lotToUse * spec.contractSize);
    const priceDeltaForProfit = singleTradeTargetUsd / (lotToUse * spec.contractSize);

    const recommendedEntry = currentPrice;
    const recommendedSL = activeTradeDirection === 'BUY' ? (currentPrice - priceDeltaForLoss) : (currentPrice + priceDeltaForLoss);
    const recommendedTP = activeTradeDirection === 'BUY' ? (currentPrice + priceDeltaForProfit) : (currentPrice - priceDeltaForProfit);

    // Populate Calculator Inputs
    const entryEl = document.getElementById('calcPriceEntry');
    const slEl = document.getElementById('calcPriceStop');
    const tpEl = document.getElementById('calcPriceTarget');

    if (entryEl) entryEl.value = recommendedEntry.toFixed(spec.dec);
    if (slEl) slEl.value = recommendedSL.toFixed(spec.dec);
    if (tpEl) tpEl.value = recommendedTP.toFixed(spec.dec);

    // Render Calculations in UI Panel
    document.getElementById('lotOutVal').innerText = `${lotToUse.toFixed(2)} Lots`;
    document.getElementById('outPossibleLoss').innerText = `-${formatZar(singleTradeRiskZar)}`;
    document.getElementById('outPossibleProfit').innerText = `+${formatZar(singleTradeTargetZar)}`;
    document.getElementById('outRemBalLoss').innerText = formatZar(userAccountBalance - singleTradeRiskZar);
    document.getElementById('outRemBalWin').innerText = formatZar(userAccountBalance + singleTradeTargetZar);

    // Display Session Risk Metrics
    const sessionRiskTag = document.getElementById('sessionRiskBreakdownTag');
    if (sessionRiskTag) {
        sessionRiskTag.innerText = `Session Risk (${userTradesPerSession} Trades): ${formatZar(totalSessionRiskZar)} | Target: ${formatZar(totalSessionTargetZar)}`;
    }
}

// Embed Official TradingView Widget
function initTradingViewWidget(symbol) {
    const container = document.getElementById('tradingview_widget');
    if (!container) return;
    container.innerHTML = '';

    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": symbol || "OANDA:XAUUSD",
            "interval": "5",
            "timezone": "Africa/Johannesburg",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#0a0f18",
            "enable_publishing": false,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_widget"
        });
    } else {
        const iframe = document.createElement('iframe');
        iframe.src = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=5&theme=dark&style=1&timezone=Africa%2FJohannesburg`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        container.appendChild(iframe);
    }
}

function switchChartAsset(assetKey) {
    currentChartAsset = assetKey;
    ['XAUUSD', 'EURUSD', 'US100'].forEach(a => {
        const btn = document.getElementById(`btn-asset-${a}`);
        if (btn) {
            btn.className = a === assetKey
                ? "px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-400 bg-[#0f1624] border border-[#1a2436]";
        }
    });

    initTradingViewWidget(assetSpecs[assetKey].tvSymbol);
    document.getElementById('livePriceQuoteDisplay').innerText = livePrices[assetKey].toFixed(assetSpecs[assetKey].dec);
    calculateBrokerRecommendations();
    render15mSignalPage();
    render5mSignalPage();
}

// Technical Analysis Signals Integrated with Exness Risk Parameters
function generateTechnicalAnalysis(assetKey, timeframe) {
    const spec = assetSpecs[assetKey];
    const price = livePrices[assetKey];
    const is15m = timeframe === '15M';

    const direction = 'BUY';
    
    // Compute SL & TP based on User's Capital & Risk Configuration
    const totalSessionRiskZar = userAccountBalance * (userRiskPercent / 100);
    const totalSessionTargetZar = userAccountBalance * (userTargetProfitPercent / 100);
    const singleTradeRiskUsd = (totalSessionRiskZar / userTradesPerSession) / globalUsdZarRate;
    const singleTradeTargetUsd = (totalSessionTargetZar / userTradesPerSession) / globalUsdZarRate;

    const priceDeltaLoss = singleTradeRiskUsd / (userCustomLotSize * spec.contractSize);
    const priceDeltaProfit = singleTradeTargetUsd / (userCustomLotSize * spec.contractSize);

    const entry = price;
    const sl = entry - priceDeltaLoss;
    const tp = entry + priceDeltaProfit;

    const biasText = is15m
        ? `15m Macro Structure: Bullish MSS. Exness/Vault Lot (${userCustomLotSize} Lots) calculated to risk ${formatZar(totalSessionRiskZar / userTradesPerSession)} per trade.`
        : `5m Micro Scalp: FVG Retest at ${entry.toFixed(spec.dec)}. Configured for ${userTradesPerSession} trade(s) per session.`;

    return {
        timeframe: is15m ? '15M Macro' : '5M Scalp',
        assetKey,
        direction,
        entry: entry.toFixed(spec.dec),
        sl: sl.toFixed(spec.dec),
        tp: tp.toFixed(spec.dec),
        biasText
    };
}

function render15mSignalPage() {
    const sig = generateTechnicalAnalysis(currentSignal15mAsset, '15M');
    const container = document.getElementById('signal15mCard');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-between items-center border-b border-[#1a2436] pb-3">
                <div>
                    <span class="text-sm font-mono font-bold text-amber-400">15-MINUTE MACRO RADAR</span>
                    <span class="text-xs font-mono text-slate-400 block">${assetSpecs[currentSignal15mAsset].name}</span>
                </div>
                <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">${sig.direction} BIAS</span>
            </div>

            <p class="text-xs font-mono text-slate-300 leading-relaxed">${sig.biasText}</p>

            <div class="grid grid-cols-3 gap-2 bg-[#0f1624] p-3 rounded-xl border border-[#1a2436] text-xs font-mono">
                <div>
                    <div class="text-slate-400">Rec. Entry</div>
                    <div class="text-white font-bold">${sig.entry}</div>
                </div>
                <div>
                    <div class="text-slate-400">Rec. Stop Loss</div>
                    <div class="text-rose-400 font-bold">${sig.sl}</div>
                </div>
                <div>
                    <div class="text-slate-400">Rec. Take Profit</div>
                    <div class="text-emerald-400 font-bold">${sig.tp}</div>
                </div>
            </div>

            <button onclick="copySignalToCalculator('${sig.assetKey}', '${sig.timeframe}', '${sig.direction}', ${sig.entry}, ${sig.sl}, ${sig.tp})" class="w-full py-2.5 rounded-xl font-mono text-xs font-extrabold bg-amber-500 text-slate-950 hover:bg-amber-400">COPY 15M SIGNAL TO CALCULATOR DESK</button>
        </div>
    `;
}

function render5mSignalPage() {
    const sig = generateTechnicalAnalysis(currentSignal5mAsset, '5M');
    const container = document.getElementById('signal5mCard');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-between items-center border-b border-[#1a2436] pb-3">
                <div>
                    <span class="text-sm font-mono font-bold text-emerald-400">5-MINUTE MICRO SCALP RADAR</span>
                    <span class="text-xs font-mono text-slate-400 block">${assetSpecs[currentSignal5mAsset].name}</span>
                </div>
                <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">${sig.direction} SCALP</span>
            </div>

            <p class="text-xs font-mono text-slate-300 leading-relaxed">${sig.biasText}</p>

            <div class="grid grid-cols-3 gap-2 bg-[#0f1624] p-3 rounded-xl border border-[#1a2436] text-xs font-mono">
                <div>
                    <div class="text-slate-400">Rec. Entry</div>
                    <div class="text-white font-bold">${sig.entry}</div>
                </div>
                <div>
                    <div class="text-slate-400">Rec. Stop Loss</div>
                    <div class="text-rose-400 font-bold">${sig.sl}</div>
                </div>
                <div>
                    <div class="text-slate-400">Rec. Take Profit</div>
                    <div class="text-emerald-400 font-bold">${sig.tp}</div>
                </div>
            </div>

            <button onclick="copySignalToCalculator('${sig.assetKey}', '${sig.timeframe}', '${sig.direction}', ${sig.entry}, ${sig.sl}, ${sig.tp})" class="w-full py-2.5 rounded-xl font-mono text-xs font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400">COPY 5M SIGNAL TO CALCULATOR DESK</button>
        </div>
    `;
}

function switchSignal15mAsset(assetKey) {
    currentSignal15mAsset = assetKey;
    render15mSignalPage();
}

function switchSignal5mAsset(assetKey) {
    currentSignal5mAsset = assetKey;
    render5mSignalPage();
}

function copySignalToCalculator(assetKey, timeframe, direction, entry, sl, tp) {
    if (currentChartAsset !== assetKey) {
        switchChartAsset(assetKey);
    }

    pendingSignal = { assetKey, timeframe, direction, entry, sl, tp };
    activeTradeDirection = direction;

    document.getElementById('calcPriceEntry').value = entry;
    document.getElementById('calcPriceStop').value = sl;
    document.getElementById('calcPriceTarget').value = tp;

    const dirTag = document.getElementById('calcSignalDirectionTag');
    if (dirTag) {
        dirTag.innerText = `${direction} (${assetKey} ${timeframe})`;
        dirTag.className = 'font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    }

    calculateBrokerRecommendations();
    switchPage('chart');
    showTradeAlert(`${assetKey} capital-optimized signal copied into calculator.`, 'info');
}

function rejectAndWaitNextSignal() {
    pendingSignal = null;
    document.getElementById('calcPriceEntry').value = '';
    document.getElementById('calcPriceStop').value = '';
    document.getElementById('calcPriceTarget').value = '';
    
    const dirTag = document.getElementById('calcSignalDirectionTag');
    if (dirTag) {
        dirTag.innerText = 'NO SIGNAL LOADED';
        dirTag.className = 'font-mono text-xs font-bold text-slate-400';
    }

    calculateBrokerRecommendations();
    showTradeAlert('Signal rejected. Calculator desk reset.', 'info');
}

// Canvas Structure Drawing
function renderChartStructureOverlay() {
    const overlay = document.getElementById('chartOverlayCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!activeSignalDrawing) return;

    const { type, entry, sl, tp, direction } = activeSignalDrawing;
    const w = overlay.width;
    const h = overlay.height;

    const entryY = h * 0.50;
    const slY = direction === 'BUY' ? h * 0.72 : h * 0.28;
    const tpY = direction === 'BUY' ? h * 0.22 : h * 0.78;

    const boxTopY = Math.min(entryY, slY);
    const boxHeight = Math.abs(entryY - slY);

    ctx.fillStyle = direction === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
    ctx.strokeStyle = direction === 'BUY' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(244, 63, 94, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    ctx.fillRect(w * 0.15, boxTopY, w * 0.7, boxHeight);
    ctx.strokeRect(w * 0.15, boxTopY, w * 0.7, boxHeight);

    ctx.setLineDash([]);
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.fillStyle = direction === 'BUY' ? '#10b981' : '#f43f5e';
    ctx.fillText(`${type} EXNESS/VAULT ZONE`, w * 0.17, boxTopY + 18);

    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, entryY);
    ctx.lineTo(w * 0.95, entryY);
    ctx.stroke();
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`ENTRY: ${entry.toFixed(assetSpecs[currentChartAsset].dec)}`, w * 0.70, entryY - 6);

    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, slY);
    ctx.lineTo(w * 0.95, slY);
    ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    ctx.fillText(`SL: ${sl.toFixed(assetSpecs[currentChartAsset].dec)}`, w * 0.70, slY - 6);

    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, tpY);
    ctx.lineTo(w * 0.95, tpY);
    ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.fillText(`TP: ${tp.toFixed(assetSpecs[currentChartAsset].dec)}`, w * 0.70, tpY - 6);
}

function confirmSignalAndOpenTrade() {
    if (!pendingSignal) {
        showTradeAlert('Please copy a signal from the 15m or 5m page first.', 'danger');
        return;
    }

    const { direction, entry, sl, tp } = pendingSignal;
    const lotSize = userCustomLotSize;

    activeOpenTrade = {
        asset: currentChartAsset,
        direction,
        entry: parseFloat(entry),
        stopLoss: parseFloat(sl),
        takeProfit: parseFloat(tp),
        lotSize,
        status: 'OPEN'
    };

    activeSignalDrawing = {
        type: `${currentChartAsset} ${direction}`,
        entry: parseFloat(entry),
        sl: parseFloat(sl),
        tp: parseFloat(tp),
        direction
    };

    renderChartStructureOverlay();
    updateTradeStatusBadge();
    updateOpenTradePanel();
    showTradeAlert(`Trade Active! Open position logged with broker contract specs.`, 'success');

    if (tradeTrackerInterval) clearInterval(tradeTrackerInterval);

    tradeTrackerInterval = setInterval(() => {
        if (!activeOpenTrade || activeOpenTrade.status !== 'OPEN') return;

        const currentLivePrice = livePrices[activeOpenTrade.asset];
        updateOpenTradePanel();

        if (isMarketOpen()) {
            const tpHit = activeOpenTrade.direction === 'BUY' ? currentLivePrice >= activeOpenTrade.takeProfit : currentLivePrice <= activeOpenTrade.takeProfit;
            const slHit = activeOpenTrade.direction === 'BUY' ? currentLivePrice <= activeOpenTrade.stopLoss : currentLivePrice >= activeOpenTrade.stopLoss;

            if (tpHit) finalizeOpenTrade(activeOpenTrade.takeProfit, 'Take Profit Hit', 'success');
            else if (slHit) finalizeOpenTrade(activeOpenTrade.stopLoss, 'Stop Loss Hit', 'danger');
        }
    }, 1000);
}

function finalizeOpenTrade(exitPrice, reason, alertType) {
    if (!activeOpenTrade) return;

    const spec = assetSpecs[activeOpenTrade.asset];
    const priceMove = activeOpenTrade.direction === 'BUY' ? exitPrice - activeOpenTrade.entry : activeOpenTrade.entry - exitPrice;
    const pnlZar = (priceMove * activeOpenTrade.lotSize * spec.contractSize) * globalUsdZarRate;

    userAccountBalance += pnlZar;
    document.getElementById('userBalanceInput').value = userAccountBalance.toFixed(2);
    
    const headerDisplay = document.getElementById('displayUserBalance');
    if (headerDisplay) headerDisplay.innerText = formatZar(userAccountBalance);

    sampleJournalLogs.unshift({
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-GB') + ' SAST',
        asset: activeOpenTrade.asset,
        type: activeOpenTrade.direction,
        lot: activeOpenTrade.lotSize.toFixed(2),
        entry: activeOpenTrade.entry.toFixed(spec.dec),
        exit: exitPrice.toFixed(spec.dec),
        pnl: Number(pnlZar.toFixed(2)),
        note: reason
    });

    activeSignalDrawing = null;
    renderChartStructureOverlay();

    showTradeAlert(`Trade Closed: ${reason} (${formatZar(pnlZar)}). Drawing removed.`, alertType);
    activeOpenTrade = null;
    if (tradeTrackerInterval) clearInterval(tradeTrackerInterval);

    updateTradeStatusBadge();
    updateOpenTradePanel();
    renderJournalTable();
    rejectAndWaitNextSignal();
}

function updateOpenTradePanel() {
    const panel = document.getElementById('openTradePanel');
    if (!panel) return;

    if (!activeOpenTrade) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    const spec = assetSpecs[activeOpenTrade.asset];
    const currentPrice = livePrices[activeOpenTrade.asset];
    const priceMove = activeOpenTrade.direction === 'BUY' ? currentPrice - activeOpenTrade.entry : activeOpenTrade.entry - currentPrice;
    const pnlZar = (priceMove * activeOpenTrade.lotSize * spec.contractSize) * globalUsdZarRate;

    document.getElementById('openTradeAsset').innerText = activeOpenTrade.asset;
    document.getElementById('openTradeDirection').innerText = activeOpenTrade.direction;
    document.getElementById('openTradeLivePnl').innerText = formatZar(pnlZar);
    document.getElementById('openTradeLivePnl').className = `font-mono font-extrabold ${pnlZar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
}

function updateTradeStatusBadge() {
    const badge = document.getElementById('tradeStatusBadge');
    if (!badge) return;
    badge.innerText = activeOpenTrade ? `TRACKING: ${activeOpenTrade.direction} ${activeOpenTrade.asset}` : 'NO OPEN DRAWING';
    badge.className = activeOpenTrade ? 'text-emerald-400 font-bold font-mono text-xs' : 'text-slate-400 font-bold font-mono text-xs';
}

function showTradeAlert(message, type = 'info') {
    const container = document.getElementById('tradeAlertContainer');
    if (!container) return;

    const alert = document.createElement('div');
    const color = type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : type === 'danger' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40';

    alert.className = `p-3 rounded-xl border text-xs font-mono font-bold shadow-xl backdrop-blur-md mb-2 ${color}`;
    alert.innerText = message;
    container.appendChild(alert);

    setTimeout(() => alert.remove(), 4000);
}

function renderEventsDesk() {
    const container = document.getElementById('eventsListContainer');
    if (!container) return;
    container.innerHTML = liveEconomicEvents.map(evt => `
        <div class="bg-[#0f1624] p-4 rounded-xl border border-[#1a2436] space-y-2">
            <div class="flex justify-between items-center">
                <span class="text-xs font-mono font-bold text-amber-400">${evt.currency} — ${evt.date} (${evt.time})</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">${evt.impact}</span>
            </div>
            <h4 class="font-mono font-bold text-sm text-white">${evt.title}</h4>
            <div class="flex justify-between text-xs font-mono text-slate-400 pt-1 border-t border-[#1a2436]">
                <span>Forecast: <strong class="text-white">${evt.forecast}</strong></span>
                <span>Previous: <strong class="text-white">${evt.previous}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderJournalTable() {
    const tbody = document.getElementById('journalTableBody');
    if (!tbody) return;
    tbody.innerHTML = sampleJournalLogs.map(row => `
        <tr class="hover:bg-[#0f1624] border-b border-[#1a2436] text-xs">
            <td class="p-3 text-slate-400">${row.time}</td>
            <td class="p-3 font-bold text-white">${row.asset}</td>
            <td class="p-3 font-bold ${row.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}">${row.type}</td>
            <td class="p-3 text-slate-300">${row.lot}</td>
            <td class="p-3 text-slate-300">${row.entry}</td>
            <td class="p-3 text-slate-300">${row.exit}</td>
            <td class="p-3 font-bold ${row.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatZar(row.pnl)}</td>
            <td class="p-3 text-slate-400">${row.note}</td>
        </tr>
    `).join('');
}

function switchPage(pageId) {
    ['chart', 'signal15m', 'signal5m', 'events', 'journal'].forEach(p => {
        const sec = document.getElementById(`page-${p}`);
        if (sec) sec.classList.add('hidden');
    });

    const activeSec = document.getElementById(`page-${pageId}`);
    if (activeSec) activeSec.classList.remove('hidden');

    if (pageId === 'signal15m') render15mSignalPage();
    if (pageId === 'signal5m') render5mSignalPage();
    if (pageId === 'events') renderEventsDesk();
    if (pageId === 'journal') renderJournalTable();
}

function startLiveSimulation() {
    setInterval(() => {
        updateMarketStatusIndicator();

        if (isMarketOpen()) {
            Object.keys(livePrices).forEach(asset => {
                const spec = assetSpecs[asset];
                const change = (Math.random() - 0.49) * (spec.atr5m * 0.08);
                livePrices[asset] = parseFloat((livePrices[asset] + change).toFixed(spec.dec));
            });
        }

        if (activeOpenTrade && activeOpenTrade.status === 'OPEN') {
            updateOpenTradePanel();
        }
    }, 1000);
}

window.onload = function() {
    startLiveSimulation();
    initTradingViewWidget('OANDA:XAUUSD');
    calculateBrokerRecommendations();
    render15mSignalPage();
    render5mSignalPage();
    renderJournalTable();
    window.addEventListener('resize', renderChartStructureOverlay);

    // Event listeners for capital & risk inputs
    ['userBalanceInput', 'userRiskPercentInput', 'userTargetProfitInput', 'userTradesPerSessionInput', 'userLotSizeInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateAccountCapitalAndRisk);
    });
};