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
                mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
            }
        }
    }
};

let currentChartAsset = 'XAUUSD';
let currentModalSignalAsset = 'XAUUSD';
let currentMatrixAsset = 'XAUUSD';
let currentChartTF = '5';
let globalUsdZarRate = 18.50;
let activeTradeDirection = 'BUY';
let lotSizeMode = 'AUTO';
let manualCustomLot = 0.10;
let activeEventFilter = 'ALL';
let mobileMenuOpen = false;
let activeOpenTrade = null;
let tradeTrackerInterval = null;

const assetSpecs = {
    'XAUUSD': {
        name: 'XAUUSD — GOLD SPOT',
        tvSymbol: 'OANDA:XAUUSD',
        basePrice: 2652.80,
        pipSize: 0.10,
        mult: 100,
        exnessLeverage: 1000,
        atr5m: 2.50
    },
    'EURUSD': {
        name: 'EURUSD — EURO / US DOLLAR',
        tvSymbol: 'FX:EURUSD',
        basePrice: 1.08520,
        pipSize: 0.0001,
        mult: 100000,
        exnessLeverage: 1000,
        atr5m: 0.0007
    },
    'US100': {
        name: 'NAS100 — NASDAQ 100 INDEX (USTEC)',
        tvSymbol: 'CAPITALCOM:US100',
        basePrice: 20150.0,
        pipSize: 1.0,
        mult: 1,
        exnessLeverage: 400,
        atr5m: 22.0
    }
};

function generate5mCandles(assetKey, count = 40) {
    const spec = assetSpecs[assetKey];
    const candles = [];
    let currentPrice = spec.basePrice;

    for (let i = count; i >= 0; i--) {
        const volatility = spec.atr5m * 0.5;
        const open = currentPrice + (Math.sin(i * 0.8) * volatility);
        const close = open + ((Math.random() - 0.47) * volatility * 1.2);
        const high = Math.max(open, close) + (Math.random() * volatility * 0.4);
        const low = Math.min(open, close) - (Math.random() * volatility * 0.4);
        const volume = Math.floor(800 + Math.random() * 2500);

        candles.push({ time: i, open, high, low, close, volume });
        currentPrice = close;
    }
    return candles;
}

function runQuantAnalysis(assetKey) {
    const candles = generate5mCandles(assetKey, 40);
    const spec = assetSpecs[assetKey];
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const lastCandle = candles[candles.length - 1];
    const currentPrice = lastCandle.close;

    function calcEMA(period, priceArray) {
        const k = 2 / (period + 1);
        let ema = priceArray[0];
        for (let i = 1; i < priceArray.length; i++) {
            ema = (priceArray[i] * k) + (ema * (1 - k));
        }
        return ema;
    }

    const ema9 = calcEMA(9, closes);
    const ema21 = calcEMA(21, closes);
    const emaDiff = ema9 - ema21;

    let emaSignal = 'NEUTRAL';
    let emaText = `EMA9 (${ema9.toFixed(2)}) ≈ EMA21 (${ema21.toFixed(2)})`;
    if (emaDiff > (spec.pipSize * 1.2)) {
        emaSignal = 'BUY';
        emaText = `Bullish Momentum: Fast EMA9 (${ema9.toFixed(2)}) > EMA21 (${ema21.toFixed(2)})`;
    } else if (emaDiff < -(spec.pipSize * 1.2)) {
        emaSignal = 'SELL';
        emaText = `Bearish Momentum: Fast EMA9 (${ema9.toFixed(2)}) < EMA21 (${ema21.toFixed(2)})`;
    }

    function calcRSI(period, priceArray) {
        let gains = 0;
        let losses = 0;
        for (let i = priceArray.length - period; i < priceArray.length; i++) {
            const diff = priceArray[i] - priceArray[i - 1];
            if (diff >= 0) gains += diff;
            else losses += Math.abs(diff);
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    const rsi = calcRSI(9, closes);
    let rsiSignal = 'NEUTRAL';
    let rsiText = `RSI(9) = ${rsi.toFixed(1)} (Mid-Range)`;
    if (rsi < 35) {
        rsiSignal = 'BUY';
        rsiText = `RSI(9) = ${rsi.toFixed(1)} (Oversold / Fast Scalp Bounce)`;
    } else if (rsi > 65) {
        rsiSignal = 'SELL';
        rsiText = `RSI(9) = ${rsi.toFixed(1)} (Overbought / Fast Rejection)`;
    }

    let ictSignal = 'NEUTRAL';
    let ictText = 'No active 5m Fair Value Gap on recent candles.';
    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    if (c3.low > c1.high) {
        ictSignal = 'BUY';
        ictText = `5m Bullish FVG Gap (${c1.high.toFixed(2)} - ${c3.low.toFixed(2)}) + Micro OB`;
    } else if (c3.high < c1.low) {
        ictSignal = 'SELL';
        ictText = `5m Bearish FVG Gap (${c3.high.toFixed(2)} - ${c1.low.toFixed(2)}) + Liquidity Sweep`;
    } else if (currentPrice > ema9) {
        ictSignal = 'BUY';
        ictText = '5m Order Block retested with upward displacement.';
    } else {
        ictSignal = 'SELL';
        ictText = '5m Premium Order Block rejected with selling volume.';
    }

    const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const lastVol = volumes[volumes.length - 1];
    const volRatio = (lastVol / avgVol) * 100;

    let volSignal = 'NEUTRAL';
    let volText = `Volume at ${volRatio.toFixed(0)}% of 10-bar average.`;
    if (volRatio > 115 && currentPrice > ema9) {
        volSignal = 'BUY';
        volText = `Scalp Volume Spike (${volRatio.toFixed(0)}% avg) confirming buy move.`;
    } else if (volRatio > 115 && currentPrice < ema9) {
        volSignal = 'SELL';
        volText = `Scalp Volume Spike (${volRatio.toFixed(0)}% avg) confirming sell move.`;
    }

    let buyVotes = 0;
    let sellVotes = 0;
    [emaSignal, rsiSignal, ictSignal, volSignal].forEach(s => {
        if (s === 'BUY') buyVotes++;
        if (s === 'SELL') sellVotes++;
    });

    let masterDirection = 'BUY';
    let masterSignalText = 'NEUTRAL / WAIT';
    let confidence = '50%';

    if (buyVotes >= 3) {
        masterDirection = 'BUY';
        masterSignalText = `STRONG BUY (${buyVotes}/4 SCALP CONFLUENCE)`;
        confidence = `${78 + (buyVotes * 5)}%`;
    } else if (sellVotes >= 3) {
        masterDirection = 'SELL';
        masterSignalText = `STRONG SELL (${sellVotes}/4 SCALP CONFLUENCE)`;
        confidence = `${78 + (sellVotes * 5)}%`;
    } else if (buyVotes > sellVotes) {
        masterDirection = 'BUY';
        masterSignalText = `MODERATE BUY (${buyVotes}/4 SCALP CONFLUENCE)`;
        confidence = '68%';
    } else {
        masterDirection = 'SELL';
        masterSignalText = `MODERATE SELL (${sellVotes}/4 SCALP CONFLUENCE)`;
        confidence = '65%';
    }

    const entryPrice = currentPrice;
    let stopLoss = 0;
    let tp1 = 0;
    let tp2 = 0;

    if (masterDirection === 'BUY') {
        stopLoss = entryPrice - (spec.atr5m * 1.0);
        tp1 = entryPrice + (spec.atr5m * 1.7);
        tp2 = entryPrice + (spec.atr5m * 2.8);
    } else {
        stopLoss = entryPrice + (spec.atr5m * 1.0);
        tp1 = entryPrice - (spec.atr5m * 1.7);
        tp2 = entryPrice - (spec.atr5m * 2.8);
    }

    const dec = assetKey === 'EURUSD' ? 5 : 2;

    return {
        assetKey,
        currentPrice: entryPrice.toFixed(dec),
        entry: entryPrice.toFixed(dec),
        sl: stopLoss.toFixed(dec),
        tp1: tp1.toFixed(dec),
        tp2: tp2.toFixed(dec),
        masterDirection,
        masterSignalText,
        confidence,
        subSignals: {
            ict: { sig: ictSignal, text: ictText },
            ema: { sig: emaSignal, text: emaText },
            vol: { sig: volSignal, text: volText },
            rsi: { sig: rsiSignal, text: rsiText }
        }
    };
}

const upcomingEventsData = [
    { id: 1, title: 'US Non-Farm Payrolls (NFP)', time: '14:30 SAST', date: 'Fri 02 Oct 2026', impact: 'HIGH', currency: 'USD', affected: 'Gold, NAS100, EURUSD', hmr: 'Exness HMR Active: Gold 1:200 max', forecast: '185K', previous: '142K' },
    { id: 2, title: 'US Consumer Price Index (CPI YoY)', time: '14:30 SAST', date: 'Fri 02 Oct 2026', impact: 'HIGH', currency: 'USD', affected: 'Gold, EURUSD', hmr: 'Exness HMR Active: FX 1:200 max', forecast: '2.5%', previous: '2.9%' },
    { id: 3, title: 'FOMC Federal Funds Rate Decision', time: '20:00 SAST', date: 'Wed 07 Oct 2026', impact: 'HIGH', currency: 'USD', affected: 'All Markets', hmr: 'Exness HMR Active: All assets', forecast: '4.75%', previous: '5.00%' },
    { id: 4, title: 'SARB Interest Rate Decision', time: '15:00 SAST', date: 'Thu 08 Oct 2026', impact: 'HIGH', currency: 'ZAR', affected: 'USDZAR Spot', hmr: 'Exness HMR: USDZAR 1:100', forecast: '8.00%', previous: '8.25%' },
    { id: 5, title: 'ECB Monetary Policy Statement', time: '14:15 SAST', date: 'Thu 15 Oct 2026', impact: 'MEDIUM', currency: 'EUR', affected: 'EURUSD', hmr: 'Exness Standard Spread Alert', forecast: '3.25%', previous: '3.50%' }
];

let sampleJournalLogs = [
    { id: 1, time: '17:42:10 SAST', asset: 'XAUUSD', type: 'BUY', lot: '0.28', entry: '2649.50', exit: '2655.80', pnl: 1764.00, risk: 'R 500.00', target: 'R 1250.00', balanceAfter: 'R 10900.00', note: 'Take profit hit' },
    { id: 2, time: '16:15:22 SAST', asset: 'EURUSD', type: 'SELL', lot: '0.80', entry: '1.0870', exit: '1.0852', pnl: 1332.00, risk: 'R 600.00', target: 'R 1500.00', balanceAfter: 'R 9600.00', note: 'Take profit hit' }
];

let tradePlanState = {
    accountEquity: 10000,
    maxLoss: 1000,
    targetProfit: 2500,
    plannedTrades: 2,
    perTradeLoss: 500,
    perTradeTarget: 1250
};

function formatZar(value) {
    return `R ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTradePlanState() {
    const equity = parseFloat(document.getElementById('equityInput')?.value) || 10000;
    const maxLoss = parseFloat(document.getElementById('maxLossInput')?.value) || 1000;
    const targetProfit = parseFloat(document.getElementById('targetProfitInput')?.value) || 2500;
    const plannedTrades = parseInt(document.getElementById('plannedTradesInput')?.value) || 1;

    return {
        accountEquity: equity,
        maxLoss,
        targetProfit,
        plannedTrades,
        perTradeLoss: plannedTrades > 0 ? maxLoss / plannedTrades : maxLoss,
        perTradeTarget: plannedTrades > 0 ? targetProfit / plannedTrades : targetProfit
    };
}

function renderTradePlanSummary() {
    const el = document.getElementById('tradePlanSummary');
    if (!el) return;

    const plan = tradePlanState;
    el.innerHTML = `
        <div class="flex items-center justify-between gap-2 border-b border-[#1a2436] pb-2">
            <span class="text-[10px] uppercase text-slate-400 font-bold">Trade Plan</span>
            <span class="text-[10px] uppercase text-blue-300 font-bold">${plan.plannedTrades} trades</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[10px]">
            <div class="rounded-lg bg-[#0f1624] px-2 py-1.5 border border-[#1a2436]">
                <div class="text-slate-400">Risk</div>
                <div class="text-rose-400 font-bold">${formatZar(plan.maxLoss)}</div>
            </div>
            <div class="rounded-lg bg-[#0f1624] px-2 py-1.5 border border-[#1a2436]">
                <div class="text-slate-400">Target</div>
                <div class="text-emerald-400 font-bold">${formatZar(plan.targetProfit)}</div>
            </div>
            <div class="rounded-lg bg-[#0f1624] px-2 py-1.5 border border-[#1a2436]">
                <div class="text-slate-400">Per trade</div>
                <div class="text-amber-400 font-bold">${formatZar(plan.perTradeLoss)}</div>
            </div>
            <div class="rounded-lg bg-[#0f1624] px-2 py-1.5 border border-[#1a2436]">
                <div class="text-slate-400">Balance</div>
                <div class="text-white font-bold">${formatZar(plan.accountEquity)}</div>
            </div>
        </div>
    `;
}

function updateTradePlanState() {
    tradePlanState = getTradePlanState();
    renderTradePlanSummary();
    return tradePlanState;
}

function renderTradeInsightsPage() {
    const totalTrades = sampleJournalLogs.filter(r => typeof r.pnl === 'number').length;
    const totalPnl = sampleJournalLogs.reduce((acc, row) => acc + (Number(row.pnl) || 0), 0);
    const wins = sampleJournalLogs.filter(r => Number(r.pnl) > 0).length;
    const avgRisk = sampleJournalLogs.length ? sampleJournalLogs.reduce((acc, row) => acc + (Number(String(row.risk || '').replace(/[^0-9.]/g, '')) || 0), 0) / sampleJournalLogs.length : 0;

    const totalEl = document.getElementById('insightsTotalTrades');
    const pnlEl = document.getElementById('insightsNetPnl');
    const winEl = document.getElementById('insightsWinRate');
    const avgEl = document.getElementById('insightsAvgRisk');
    const recentEl = document.getElementById('insightsRecentList');
    const budgetEl = document.getElementById('insightsBudget');
    const targetEl = document.getElementById('insightsTarget');
    const remainingEl = document.getElementById('insightsRemaining');

    if (totalEl) totalEl.innerText = String(totalTrades);
    if (pnlEl) pnlEl.innerText = formatZar(totalPnl);
    if (winEl) winEl.innerText = sampleJournalLogs.length ? `${Math.round((wins / sampleJournalLogs.length) * 100)}%` : '0%';
    if (avgEl) avgEl.innerText = formatZar(avgRisk);
    if (budgetEl) budgetEl.innerText = formatZar(tradePlanState.maxLoss);
    if (targetEl) targetEl.innerText = formatZar(tradePlanState.targetProfit);
    if (remainingEl) remainingEl.innerText = formatZar(tradePlanState.accountEquity + totalPnl);

    if (recentEl) {
        recentEl.innerHTML = sampleJournalLogs.slice(0, 5).map(row => `
            <div class="flex items-center justify-between border-b border-[#1a2436] pb-2 last:border-0 last:pb-0">
                <div>
                    <div class="font-mono font-bold text-white">${row.asset} ${row.type}</div>
                    <div class="text-[10px] text-slate-400">${row.time}</div>
                </div>
                <div class="text-right">
                    <div class="font-mono font-bold ${Number(row.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatZar(row.pnl)}</div>
                    <div class="text-[10px] text-slate-400">${row.note || 'Closed'}</div>
                </div>
            </div>
        `).join('');
    }
}

function addJournalEntryFromTrade({ asset, direction, entry, exit, lotSize, pnl, reason, plan }) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} SAST`;

    const balanceAfter = (plan?.accountEquity || tradePlanState.accountEquity) + pnl;
    sampleJournalLogs.unshift({
        id: Date.now(),
        time: timeStr,
        asset,
        type: direction,
        lot: Number(lotSize).toFixed(2),
        entry: String(entry),
        exit: String(exit),
        pnl: Number(pnl.toFixed(2)),
        risk: formatZar(plan?.perTradeLoss || tradePlanState.perTradeLoss),
        target: formatZar(plan?.perTradeTarget || tradePlanState.perTradeTarget),
        balanceAfter: formatZar(balanceAfter),
        note: reason || 'Closed trade'
    });

    renderJournalTable();
    renderTradeInsightsPage();
}

function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
    const drawer = document.getElementById('mobileDrawer');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const icon = document.getElementById('hamburgerIcon');

    if (mobileMenuOpen) {
        if (drawer) drawer.classList.remove('-translate-x-full');
        if (backdrop) backdrop.classList.remove('hidden');
        if (icon) icon.setAttribute('data-lucide', 'x');
    } else {
        if (drawer) drawer.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
        if (icon) icon.setAttribute('data-lucide', 'menu');
    }
    lucide.createIcons();
}

function closeMobileMenu() {
    mobileMenuOpen = false;
    const drawer = document.getElementById('mobileDrawer');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const icon = document.getElementById('hamburgerIcon');

    if (drawer) drawer.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    if (icon) icon.setAttribute('data-lucide', 'menu');
    lucide.createIcons();
}

function switchPage(pageId) {
    ['chart', 'guardrail', 'matrix', 'events', 'journal', 'insights', 'sadesk'].forEach(p => {
        const sec = document.getElementById(`page-${p}`);
        const desktopBtn = document.getElementById(`nav-${p}`);
        const drawerBtn = document.getElementById(`drawer-nav-${p}`);

        if (sec) sec.classList.add('hidden');
        if (desktopBtn) desktopBtn.classList.remove('desktop-nav-active');
        if (drawerBtn) drawerBtn.classList.remove('nav-tab-active');
    });

    const activeSec = document.getElementById(`page-${pageId}`);
    const activeDesktopBtn = document.getElementById(`nav-${pageId}`);
    const activeDrawerBtn = document.getElementById(`drawer-nav-${pageId}`);

    if (activeSec) activeSec.classList.remove('hidden');
    if (activeDesktopBtn) activeDesktopBtn.classList.add('desktop-nav-active');
    if (activeDrawerBtn) activeDrawerBtn.classList.add('nav-tab-active');

    if (pageId === 'chart') initTradingViewChart(assetSpecs[currentChartAsset].tvSymbol, currentChartTF);
    if (pageId === 'matrix') render15mMatrixUI(currentMatrixAsset);
    if (pageId === 'events') renderEventsDesk();
    if (pageId === 'journal') renderJournalTable();
    if (pageId === 'insights') renderTradeInsightsPage();

    closeMobileMenu();
    lucide.createIcons();
}

function initTradingViewChart(symbol, interval) {
    const container = document.getElementById('tradingview_widget');
    if (!container) return;
    container.innerHTML = '';
    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": symbol || "OANDA:XAUUSD",
            "interval": interval || "5",
            "timezone": "Africa/Johannesburg",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#0a0f18",
            "enable_publishing": false,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_widget",
            "studies": [
                "RSI@tv-basicstudies",
                "MACD@tv-basicstudies"
            ]
        });
    } else {
        container.innerHTML = `<iframe src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol || 'OANDA:XAUUSD')}&interval=${interval || '5'}&symboledit=1&saveimage=1&toolbarbg=0a0f18&studies=RSI%40tv-basicstudies%2CMACD%40tv-basicstudies&theme=dark&style=1&timezone=Africa%2FJohannesburg" style="width:100%;height:100%;border:none;"></iframe>`;
    }
}

function switchChartAsset(assetKey) {
    currentChartAsset = assetKey;
    ['XAUUSD', 'EURUSD', 'US100'].forEach(a => {
        const btn = document.getElementById(`btn-asset-${a}`);
        if (btn) {
            btn.className = a === assetKey
                ? "px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-400 hover:text-white bg-[#0f1624] border border-[#1a2436]";
        }
    });

    const spec = assetSpecs[assetKey];
    initTradingViewChart(spec.tvSymbol, currentChartTF);

    const quant = runQuantAnalysis(assetKey);
    document.getElementById('calcPriceEntry').value = quant.entry;
    document.getElementById('calcPriceStop').value = quant.sl;
    document.getElementById('calcPriceTarget').value = quant.tp1;
    setTradeDirection(quant.masterDirection);
    recalculateZarLots();
}

function switchChartTF(tf) {
    currentChartTF = tf;
    ['1', '5', '15', '60'].forEach(t => {
        const btn = document.getElementById(`tf-${t}`);
        if (btn) {
            btn.className = t === tf
                ? (t === '5' ? "px-2.5 py-1 rounded text-xs font-mono bg-amber-500 text-slate-950 border border-amber-400 font-extrabold" : "px-2.5 py-1 rounded text-xs font-mono bg-blue-600 text-white border border-blue-500 font-bold")
                : "px-2.5 py-1 rounded text-xs font-mono bg-[#0f1624] text-slate-400 border border-[#1a2436] hover:text-white";
        }
    });
    initTradingViewChart(assetSpecs[currentChartAsset].tvSymbol, tf);
}

function setTradeDirection(dir) {
    activeTradeDirection = dir;
    const btnBuy = document.getElementById('btnDirBuy');
    const btnSell = document.getElementById('btnDirSell');

    if (dir === 'BUY') {
        btnBuy.className = "py-2 rounded-xl font-mono text-xs font-extrabold bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-1.5";
        btnSell.className = "py-2 rounded-xl font-mono text-xs font-bold bg-[#0f1624] text-slate-400 border border-[#1a2436] hover:text-white transition flex items-center justify-center space-x-1.5";
    } else {
        btnSell.className = "py-2 rounded-xl font-mono text-xs font-extrabold bg-rose-500 text-white shadow-lg shadow-rose-500/20 transition flex items-center justify-center space-x-1.5";
        btnBuy.className = "py-2 rounded-xl font-mono text-xs font-bold bg-[#0f1624] text-slate-400 border border-[#1a2436] hover:text-white transition flex items-center justify-center space-x-1.5";
    }
    recalculateZarLots();
}

function parseLotText(lotText) {
    const clean = (lotText || '').replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
}

function toggleOpenTradePanel(mode) {
    const panel = document.getElementById('openTradePanel');
    const minimized = document.getElementById('openTradePanelMinimized');

    if (!panel || !minimized) return;

    if (mode === 'minimize') {
        panel.classList.add('hidden');
        minimized.classList.remove('hidden');
        return;
    }

    panel.classList.remove('hidden');
    minimized.classList.add('hidden');
}

function makeTradePanelDraggable() {
    const panel = document.getElementById('openTradePanel');
    const handle = panel?.querySelector('.draggable-handle');
    if (!panel || !handle) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button')) return;

        isDragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
        if (!isDragging) return;

        const maxX = window.innerWidth - panel.offsetWidth - 12;
        const maxY = window.innerHeight - panel.offsetHeight - 12;
        const nextX = Math.min(Math.max(event.clientX - offsetX, 12), maxX);
        const nextY = Math.min(Math.max(event.clientY - offsetY, 12), maxY);

        panel.style.left = `${nextX}px`;
        panel.style.top = `${nextY}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    handle.addEventListener('pointerup', () => {
        isDragging = false;
    });

    handle.addEventListener('pointerleave', () => {
        isDragging = false;
    });
}

function updateOpenTradePanel() {
    const panel = document.getElementById('openTradePanel');
    if (!panel) return;

    if (!activeOpenTrade) {
        updateMinimizedTradePnl();
        panel.classList.add('hidden');
        document.getElementById('openTradePanelMinimized')?.classList.remove('hidden');
        return;
    }

    const formula = runQuantAnalysis(activeOpenTrade.asset);
    const livePriceText = document.getElementById('chartLiveTickPrice')?.innerText || formula.currentPrice;
    const liveValue = Number.parseFloat(String(livePriceText).replace(/[^0-9.\-]/g, '')) || Number.parseFloat(String(formula.currentPrice).replace(/[^0-9.\-]/g, '')) || 0;

    document.getElementById('openTradeAsset').innerText = activeOpenTrade.asset;
    document.getElementById('openTradeDirection').innerText = activeOpenTrade.direction;
    document.getElementById('openTradeDirection').className = activeOpenTrade.direction === 'BUY'
        ? 'font-mono text-sm font-extrabold text-emerald-400'
        : 'font-mono text-sm font-extrabold text-rose-400';
    document.getElementById('openTradeLots').innerText = `${activeOpenTrade.lotSize.toFixed(2)} Lots`;
    document.getElementById('openTradeEntry').innerText = activeOpenTrade.entry.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
    document.getElementById('openTradeStop').innerText = activeOpenTrade.stopLoss.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
    document.getElementById('openTradeTP').innerText = activeOpenTrade.takeProfit.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
    document.getElementById('openTradeLivePrice').innerText = liveValue.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
    updateMinimizedTradePnl(liveValue);

    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        document.getElementById('openTradePanelMinimized')?.classList.add('hidden');
    }
}

function updateMinimizedTradePnl(livePrice) {
    const pnlElement = document.getElementById('openTradeMinimizedPnl');
    const panelPnlElement = document.getElementById('openTradeLivePnl');
    if (!pnlElement && !panelPnlElement) return;

    if (!activeOpenTrade || activeOpenTrade.status !== 'OPEN') {
        pnlElement?.classList.add('hidden');
        if (panelPnlElement) {
            panelPnlElement.textContent = '—';
            panelPnlElement.className = 'font-extrabold text-slate-300';
        }
        return;
    }

    const priceText = document.getElementById('chartLiveTickPrice')?.innerText || '';
    const currentPrice = Number.isFinite(livePrice)
        ? livePrice
        : Number.parseFloat(String(priceText).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(currentPrice)) return;

    const pnl = calculateTradePnl(activeOpenTrade, currentPrice);
    const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
    const formattedPnl = `${sign}${formatZar(Math.abs(pnl))}`;
    const pnlTone = pnl > 0 ? 'text-emerald-300' : pnl < 0 ? 'text-rose-300' : 'text-slate-300';
    if (pnlElement) {
        pnlElement.textContent = formattedPnl;
        pnlElement.className = pnl > 0
        ? 'rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300'
        : pnl < 0
            ? 'rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-300'
            : 'rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300';
    }
    if (panelPnlElement) {
        panelPnlElement.textContent = formattedPnl;
        panelPnlElement.className = `font-mono text-sm font-extrabold ${pnlTone}`;
    }
}

function updateTradeStatusBadge() {
    const badge = document.getElementById('tradeStatusBadge');
    const closeBtn = document.getElementById('closeTradeBtn');
    if (!badge) return;

    if (!activeOpenTrade) {
        updateMinimizedTradePnl();
        badge.innerText = 'NO OPEN TRADE';
        badge.className = 'font-bold text-slate-400';
        if (closeBtn) {
            closeBtn.disabled = true;
            closeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            closeBtn.classList.remove('hover:bg-rose-500/20');
        }
        document.getElementById('openTradePanelMinimized')?.classList.remove('hidden');
        return;
    }

    const { direction, status, asset } = activeOpenTrade;
    const label = status === 'OPEN' ? `${direction} ${asset} TRACKING` : `${direction} ${asset} CLOSED`;
    badge.innerText = label;
    badge.className = status === 'OPEN'
        ? 'font-bold text-emerald-400'
        : 'font-bold text-amber-400';

    if (closeBtn) {
        closeBtn.disabled = status !== 'OPEN';
        closeBtn.classList.toggle('opacity-50', status !== 'OPEN');
        closeBtn.classList.toggle('cursor-not-allowed', status !== 'OPEN');
        if (status === 'OPEN') {
            closeBtn.classList.add('hover:bg-rose-500/20');
        } else {
            closeBtn.classList.remove('hover:bg-rose-500/20');
        }
    }

    const minim = document.getElementById('openTradePanelMinimized');
    const panel = document.getElementById('openTradePanel');
    if (panel && activeOpenTrade.status === 'OPEN') {
        panel.classList.remove('hidden');
        minim?.classList.add('hidden');
    }
}

function closeOpenTrade() {
    const livePriceEl = document.getElementById('chartLiveTickPrice');
    const closePrice = livePriceEl
        ? Number.parseFloat(livePriceEl.innerText.replace(/,/g, '').replace(/[^0-9.-]/g, ''))
        : activeOpenTrade?.entry;
    finalizeOpenTrade(closePrice, 'Manual close', 'info', activeOpenTrade ? `${activeOpenTrade.direction} ${activeOpenTrade.asset} closed manually.` : '');
}

function finalizeOpenTrade(exitPrice, reason, alertType, alertMessage) {
    if (!activeOpenTrade || activeOpenTrade.status !== 'OPEN') return;

    const trade = activeOpenTrade;
    const finalPrice = Number.isFinite(exitPrice) ? exitPrice : trade.entry;
    const pnl = calculateTradePnl(trade, finalPrice);
    if (alertMessage) showTradeAlert(alertMessage, alertType);
    addJournalEntryFromTrade({
        asset: trade.asset,
        direction: trade.direction,
        entry: trade.entry,
        exit: finalPrice,
        lotSize: trade.lotSize,
        pnl,
        reason,
        plan: trade.plan || {
            accountEquity: tradePlanState.accountEquity,
            perTradeLoss: tradePlanState.perTradeLoss,
            perTradeTarget: tradePlanState.perTradeTarget
        }
    });

    trade.status = 'CLOSED';
    activeOpenTrade = null;

    if (tradeTrackerInterval) {
        clearInterval(tradeTrackerInterval);
        tradeTrackerInterval = null;
    }

    updateTradeStatusBadge();
    updateOpenTradePanel();
}

function showTradeAlert(message, type = 'info') {
    const container = document.getElementById('tradeAlertContainer');
    if (!container) return;

    const alert = document.createElement('div');
    const tone = type === 'success'
        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
        : type === 'danger'
            ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
            : 'bg-blue-500/15 border border-blue-500/40 text-blue-300';

    alert.className = `${tone} pointer-events-auto rounded-xl px-3 py-2 text-xs font-mono font-bold shadow-xl backdrop-blur-md`;
    alert.innerHTML = `<div class="flex items-center gap-2"><span class="inline-flex h-2 w-2 rounded-full ${type === 'danger' ? 'bg-rose-400' : type === 'success' ? 'bg-emerald-400' : 'bg-blue-400'}"></span><span>${message}</span></div>`;
    container.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 4000);
}

function confirmTradeSetup(direction) {
    setTradeDirection(direction);
    const plan = updateTradePlanState();

    const entry = parseFloat(document.getElementById('calcPriceEntry').value) || 0;
    const sl = parseFloat(document.getElementById('calcPriceStop').value) || 0;
    const tp = parseFloat(document.getElementById('calcPriceTarget').value) || 0;
    const lotSize = parseLotText(document.getElementById('lotOutVal').innerText);

    if (!entry || !sl || !tp || lotSize <= 0) {
        showTradeAlert('Enter valid entry, SL, TP and lot size before confirming the trade.', 'info');
        return;
    }

    activeOpenTrade = {
        asset: currentChartAsset,
        direction,
        entry,
        stopLoss: sl,
        takeProfit: tp,
        lotSize,
        status: 'OPEN',
        openedAt: Date.now(),
        plan: {
            accountEquity: plan.accountEquity,
            maxLoss: plan.maxLoss,
            targetProfit: plan.targetProfit,
            perTradeLoss: plan.perTradeLoss,
            perTradeTarget: plan.perTradeTarget,
            plannedTrades: plan.plannedTrades
        }
    };

    updateTradeStatusBadge();
    updateOpenTradePanel();
    showTradeAlert(`${direction} ${currentChartAsset} confirmed — ${lotSize.toFixed(2)} lots tracked. TP ${tp.toFixed(2)} / SL ${sl.toFixed(2)}`, 'success');

    if (tradeTrackerInterval) {
        clearInterval(tradeTrackerInterval);
    }

    tradeTrackerInterval = setInterval(() => {
        if (!activeOpenTrade || activeOpenTrade.status !== 'OPEN') return;

        const livePriceEl = document.getElementById('chartLiveTickPrice');
        const currentLivePrice = livePriceEl ? parseFloat(livePriceEl.innerText.replace(/[^0-9.]/g, '')) : runQuantAnalysis(currentChartAsset).currentPrice;

        if (!currentLivePrice) return;

        const { direction: tradeDirection, stopLoss, takeProfit } = activeOpenTrade;
        updateMinimizedTradePnl(currentLivePrice);
        const tpHit = tradeDirection === 'BUY'
            ? currentLivePrice >= takeProfit
            : currentLivePrice <= takeProfit;

        const slHit = tradeDirection === 'BUY'
            ? currentLivePrice <= stopLoss
            : currentLivePrice >= stopLoss;

        if (tpHit) {
            const priceText = currentLivePrice.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
            finalizeOpenTrade(currentLivePrice, 'Take profit hit', 'success', `${tradeDirection} ${activeOpenTrade.asset} TAKE PROFIT HIT at ${priceText}.`);
            return;
        }

        if (slHit) {
            const priceText = currentLivePrice.toFixed(activeOpenTrade.asset === 'EURUSD' ? 5 : 2);
            finalizeOpenTrade(currentLivePrice, 'Stop loss hit', 'danger', `${tradeDirection} ${activeOpenTrade.asset} STOP LOSS HIT at ${priceText}.`);
        }
    }, 1500);
}

function setLotSizeMode(mode) {
    lotSizeMode = mode;
    const btnAuto = document.getElementById('lotModeAutoBtn');
    const btnManual = document.getElementById('lotModeManualBtn');
    const presetRow = document.getElementById('lotPresetRow');

    if (mode === 'AUTO') {
        btnAuto.className = "px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-600 text-white";
        btnManual.className = "px-2.5 py-0.5 rounded text-[11px] font-mono font-bold text-slate-400 hover:text-slate-200";
        presetRow.classList.add('opacity-50', 'pointer-events-none');
    } else {
        btnManual.className = "px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-600 text-white";
        btnAuto.className = "px-2.5 py-0.5 rounded text-[11px] font-mono font-bold text-slate-400 hover:text-slate-200";
        presetRow.classList.remove('opacity-50', 'pointer-events-none');
    }
    recalculateZarLots();
}

function setPresetLot(val) {
    manualCustomLot = val;
    recalculateZarLots();
}

function autoAlignPricesToChart() {
    const quant = runQuantAnalysis(currentChartAsset);
    document.getElementById('calcPriceEntry').value = quant.entry;
    document.getElementById('calcPriceStop').value = quant.sl;
    document.getElementById('calcPriceTarget').value = quant.tp1;
    setTradeDirection(quant.masterDirection);
    recalculateZarLots();
}

function recalculateZarLots() {
    const entry = parseFloat(document.getElementById('calcPriceEntry').value) || 0;
    const sl = parseFloat(document.getElementById('calcPriceStop').value) || 0;
    const tp = parseFloat(document.getElementById('calcPriceTarget').value) || 0;

    const spec = assetSpecs[currentChartAsset];
    const pipsSL = Math.abs(entry - sl);
    const pipsTP = Math.abs(tp - entry);

    const perTradeLossZar = parseFloat(document.getElementById('guardOutPerTradeLoss').innerText.replace(/[^0-9.]/g, '')) || 500;

    let pipValueZar = 0;
    if (currentChartAsset === 'XAUUSD') pipValueZar = 10 * globalUsdZarRate * (pipsSL / 0.10);
    else if (currentChartAsset === 'EURUSD') pipValueZar = 10 * globalUsdZarRate * (pipsSL / 0.0001);
    else pipValueZar = 1 * globalUsdZarRate * pipsSL;

    let calculatedLots = 0.10;

    if (lotSizeMode === 'AUTO') {
        calculatedLots = pipValueZar > 0 ? (perTradeLossZar / pipValueZar) : 0.10;
        if (calculatedLots < 0.01) calculatedLots = 0.01;
    } else {
        calculatedLots = manualCustomLot;
    }

    const notionalUsd = (entry * spec.mult * calculatedLots);
    const marginZar = (notionalUsd / spec.exnessLeverage) * globalUsdZarRate;

    const lossZar = lotSizeMode === 'AUTO' ? perTradeLossZar : (calculatedLots * pipValueZar);
    const profitZar = lossZar * (pipsSL > 0 ? (pipsTP / pipsSL) : 1.7);

    document.getElementById('lotOutVal').innerText = `${calculatedLots.toFixed(2)} Lots`;
    document.getElementById('lotOutPipsSL').innerText = `${pipsSL.toFixed(currentChartAsset === 'EURUSD' ? 4 : 1)} Pips (-R ${Math.round(lossZar).toLocaleString()})`;
    document.getElementById('lotOutPipsTP').innerText = `${pipsTP.toFixed(currentChartAsset === 'EURUSD' ? 4 : 1)} Pips (+R ${Math.round(profitZar).toLocaleString()})`;
    document.getElementById('lotOutMarginZar').innerText = `R ${marginZar.toFixed(2)} ZAR`;
}

function runGuardrailCheck() {
    tradePlanState = getTradePlanState();
    renderTradePlanSummary();

    const equity = tradePlanState.accountEquity;
    const maxLoss = tradePlanState.maxLoss;
    const targetProfit = tradePlanState.targetProfit;
    const trades = tradePlanState.plannedTrades;

    const perTradeLoss = tradePlanState.perTradeLoss;
    const perTradeProfit = tradePlanState.perTradeTarget;
    const rr = perTradeLoss > 0 ? (perTradeProfit / perTradeLoss) : 0;
    const expPct = (maxLoss / equity) * 100;

    let score = Math.round((expPct * 3) + (rr < 1.5 ? 40 : 10) + (trades > 4 ? 20 : 5));
    if (score > 100) score = 100;

    document.getElementById('guardOutPerTradeLoss').innerText = `R ${perTradeLoss.toFixed(2)}`;
    document.getElementById('guardOutPerTradeProfit').innerText = `R ${perTradeProfit.toFixed(2)}`;

    const rrEl = document.getElementById('guardOutRR');
    if (rrEl) rrEl.innerText = `1 : ${rr.toFixed(2)}`;

    const scoreEl = document.getElementById('guardOutRiskScore');
    if (scoreEl) {
        scoreEl.innerText = `${score} / 100 (${score < 35 ? 'LOW' : (score < 65 ? 'MODERATE' : 'HIGH')})`;
        scoreEl.className = score < 35 ? "text-xl font-mono font-extrabold text-emerald-400" : (score < 65 ? "text-xl font-mono font-extrabold text-amber-400" : "text-xl font-mono font-extrabold text-rose-400");
    }

    const advEl = document.getElementById('guardOutAdvisability');
    const advDesc = document.getElementById('guardOutAdvisabilityDesc');

    if (maxLoss >= targetProfit) {
        if (advEl) advEl.innerText = "DO NOT EXECUTE — MAX LOSS EXCEEDS TARGET PROFIT";
        if (advDesc) advDesc.innerText = "Risking more than your potential profit breaks scalping probability. Adjust target profit higher or lower max loss.";
    } else {
        if (advEl) advEl.innerText = "RECOMMENDED — SCALP REWARD / RISK VALID";
        if (advDesc) advDesc.innerText = `Your total target profit (R ${targetProfit.toLocaleString()}) exceeds potential max loss (R ${maxLoss.toLocaleString()}). Allocating R ${perTradeLoss.toFixed(2)} per trade keeps risk controlled.`;
    }

    recalculateZarLots();
}

function syncGuardrailToChart() {
    updateTradePlanState();
    runGuardrailCheck();
    switchPage('chart');
}

function switchMatrixAsset(assetKey) {
    currentMatrixAsset = assetKey;
    ['XAUUSD', 'EURUSD', 'US100'].forEach(a => {
        const btn = document.getElementById(`matBtn-${a}`);
        if (btn) {
            btn.className = a === assetKey
                ? "px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-400 hover:text-white bg-[#0f1624] border border-[#1a2436]";
        }
    });
    render15mMatrixUI(assetKey);
}

function render15mMatrixUI(assetKey) {
    const quant = runQuantAnalysis(assetKey);
    const sub = quant.subSignals;

    const updateMatCard = (sigKey, data) => {
        const badge = document.getElementById(`matSig${sigKey}`);
        const desc = document.getElementById(`matDesc${sigKey}`);
        if (badge) {
            badge.innerText = data.sig;
            badge.className = data.sig === 'BUY'
                ? 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : (data.sig === 'SELL'
                    ? 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30');
        }
        if (desc) desc.innerText = data.text;
    };

    updateMatCard('Ict', sub.ict);
    updateMatCard('Ema', sub.ema);
    updateMatCard('Vol', sub.vol);
    updateMatCard('Rsi', sub.rsi);
}

function renderEventsDesk() {
    const container = document.getElementById('eventsListContainer');
    if (!container) return;
    container.innerHTML = '';

    const filtered = upcomingEventsData.filter(e => {
        if (activeEventFilter === 'ALL') return true;
        return e.impact === activeEventFilter;
    });

    filtered.forEach(evt => {
        const card = document.createElement('div');
        card.className = "bg-[#05080e] p-4 rounded-xl border border-[#1a2436] space-y-3 relative flex flex-col justify-between";

        const impactBadge = evt.impact === 'HIGH'
            ? '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">HIGH IMPACT</span>'
            : '<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">MEDIUM IMPACT</span>';

        card.innerHTML = `
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">Date</span>
                        <span class="text-xs font-mono font-extrabold text-white">${evt.date}</span>
                    </div>
                    ${impactBadge}
                </div>

                <div class="flex items-center justify-between gap-2 border-b border-[#1a2436] pb-2">
                    <span class="text-xs font-mono font-extrabold text-amber-400">${evt.currency}</span>
                    <span class="text-xs font-mono text-slate-300">${evt.time}</span>
                </div>

                <h4 class="font-mono font-extrabold text-sm text-slate-100 leading-snug">${evt.title}</h4>
                <p class="text-xs text-slate-400 font-sans">Affects: <strong class="text-amber-400 font-mono">${evt.affected}</strong></p>
            </div>

            <div class="pt-2 border-t border-[#1a2436] space-y-1 font-mono text-[11px]">
                <div class="flex justify-between text-slate-400 gap-2">
                    <span>Forecast / Previous:</span>
                    <span class="text-white font-bold">${evt.forecast} / ${evt.previous}</span>
                </div>
                <div class="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-amber-300 text-[10px] leading-relaxed">
                    <i data-lucide="alert-triangle" class="w-3 h-3 inline mr-1"></i>
                    ${evt.hmr}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

function filterEvents(level) {
    activeEventFilter = level;
    ['ALL', 'HIGH', 'MEDIUM'].forEach(l => {
        const btn = document.getElementById(`evtFilter${l}`);
        if (btn) {
            btn.className = l === level
                ? "px-3 py-1 rounded-lg bg-blue-600 text-white font-bold"
                : "px-3 py-1 rounded-lg bg-[#0f1624] border border-[#1a2436] text-slate-400 hover:text-white font-bold";
        }
    });
    renderEventsDesk();
}

function triggerSignalPopup(assetKey) {
    const modal = document.getElementById('signalModal');
    currentModalSignalAsset = assetKey || currentChartAsset;
    updateModalSignalAssetUI(currentModalSignalAsset);
    if (modal) modal.classList.remove('hidden');
}

function closeSignalPopup() {
    const modal = document.getElementById('signalModal');
    if (modal) modal.classList.add('hidden');
}

function switchModalSignalAsset(assetKey) {
    currentModalSignalAsset = assetKey;
    updateModalSignalAssetUI(assetKey);
}

function updateModalSignalAssetUI(assetKey) {
    const quant = runQuantAnalysis(assetKey);
    const spec = assetSpecs[assetKey];
    const sub = quant.subSignals;

    ['XAUUSD', 'EURUSD', 'US100'].forEach(k => {
        const btn = document.getElementById(`modalTab${k}`);
        if (btn) {
            btn.className = k === assetKey
                ? "px-3 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "px-3 py-1 rounded text-xs font-mono font-bold text-slate-400 hover:text-slate-200";
        }
    });

    document.getElementById('popupAssetTag').innerText = spec.name;
    document.getElementById('popupMasterSignalText').innerText = quant.masterSignalText;

    const badge = document.getElementById('popupMasterSignalBadge');
    if (badge) {
        badge.className = quant.masterDirection === 'BUY'
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-mono font-extrabold flex items-center gap-1.5 shadow-md"
            : "bg-rose-500/20 text-rose-400 border border-rose-500/40 px-3 py-1 rounded-lg text-xs font-mono font-extrabold flex items-center gap-1.5 shadow-md";
    }

    document.getElementById('popupConfluenceScore').innerText = `${quant.confidence} Confidence`;

    document.getElementById('popupEntryPrice').innerText = quant.entry;
    document.getElementById('popupStopPrice').innerText = quant.sl;
    document.getElementById('popupTp1Price').innerText = quant.tp1;
    document.getElementById('popupTp2Price').innerText = quant.tp2;

    const formatSubModal = (key, data) => {
        const sigBadge = document.getElementById(`modalSubSignal${key}`);
        const textEl = document.getElementById(`popupModal${key}Text`);

        if (textEl) textEl.innerText = data.text;
        if (sigBadge) {
            sigBadge.innerText = data.sig;
            sigBadge.className = data.sig === 'BUY'
                ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : (data.sig === 'SELL'
                    ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30');
        }
    };

    formatSubModal('Ict', sub.ict);
    formatSubModal('Ema', sub.ema);
    formatSubModal('Vol', sub.vol);
    formatSubModal('Rsi', sub.rsi);
}

function applySignalToOnChartCalc() {
    if (currentChartAsset !== currentModalSignalAsset) {
        switchChartAsset(currentModalSignalAsset);
    } else {
        autoAlignPricesToChart();
    }
    closeSignalPopup();
}

function logTradeFromCalculator() {
    const entry = parseFloat(document.getElementById('calcPriceEntry').value) || 0;
    const sl = parseFloat(document.getElementById('calcPriceStop').value) || 0;
    const tp = parseFloat(document.getElementById('calcPriceTarget').value) || 0;
    const lotsText = document.getElementById('lotOutVal').innerText;
    const plan = updateTradePlanState();

    const lotSize = Number.parseFloat(String(lotsText).replace(/[^0-9.]/g, '')) || 0.10;
    const exitPrice = activeTradeDirection === 'BUY' ? tp : sl;
    const pnl = calculateTradePnl({
        asset: currentChartAsset,
        direction: activeTradeDirection,
        entry,
        lotSize,
        stopLoss: sl,
        takeProfit: tp
    }, exitPrice);

    sampleJournalLogs.unshift({
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-GB', { hour12: false }) + ' SAST',
        asset: currentChartAsset,
        type: activeTradeDirection,
        lot: lotSize.toFixed(2),
        entry: entry.toString(),
        exit: exitPrice.toString(),
        pnl: Number(pnl.toFixed(2)),
        risk: formatZar(plan.perTradeLoss),
        target: formatZar(plan.perTradeTarget),
        balanceAfter: formatZar(plan.accountEquity + pnl),
        note: 'Manual journal log'
    });

    renderJournalTable();
    renderTradeInsightsPage();
    switchPage('journal');
}

function calculateTradePnl(trade, exitPrice) {
    const spec = assetSpecs[trade.asset];
    const priceMove = trade.direction === 'BUY' ? exitPrice - trade.entry : trade.entry - exitPrice;
    const priceUnit = trade.asset === 'XAUUSD' ? 100 : trade.asset === 'EURUSD' ? 100000 : 1;
    const pnlUsd = priceMove * trade.lotSize * priceUnit;
    return pnlUsd * globalUsdZarRate;
}

function renderJournalTable() {
    const tbody = document.getElementById('journalTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalPnl = 0;

    sampleJournalLogs.forEach(row => {
        totalPnl += Number(row.pnl) || 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-[#0f1624] transition border-b border-[#1a2436]";
        tr.innerHTML = `
            <td class="p-3 text-slate-400">${row.time}</td>
            <td class="p-3 font-bold text-white">${row.asset}</td>
            <td class="p-3 font-bold ${row.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}">${row.type}</td>
            <td class="p-3 text-slate-300">${row.lot}</td>
            <td class="p-3 text-slate-300">${row.entry}</td>
            <td class="p-3 text-slate-300">${row.exit}</td>
            <td class="p-3 font-bold ${Number(row.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatZar(row.pnl)}</td>
            <td class="p-3 text-slate-300">${row.risk || '—'}</td>
            <td class="p-3 text-slate-300">${row.target || '—'}</td>
            <td class="p-3 text-slate-300">${row.balanceAfter || '—'}</td>
            <td class="p-3 text-slate-300">${row.note || 'Trade'}</td>
            <td class="p-3">
                <button onclick="deleteJournalRow(${row.id})" class="text-slate-500 hover:text-rose-400 p-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const totEl = document.getElementById('journalTotalPnl');
    if (totEl) totEl.innerText = `${formatZar(totalPnl)}`;
    renderTradeInsightsPage();
    lucide.createIcons();
}

function exportJournalCSV() {
    let csvContent = "data:text/csv;charset=utf-8,Time,Asset,Type,Lot,Entry,Exit,PnL_ZAR,Risk,Target,Balance_Left,Note\n";
    sampleJournalLogs.forEach(r => {
        csvContent += `${r.time},${r.asset},${r.type},${r.lot},${r.entry},${r.exit},${r.pnl},${r.risk || ''},${r.target || ''},${r.balanceAfter || ''},${r.note || ''}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TradePro_Scalp_Journal_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function deleteJournalRow(id) {
    sampleJournalLogs = sampleJournalLogs.filter(r => r.id !== id);
    renderJournalTable();
}

function startLiveClock() {
    setInterval(() => {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const clockEl = document.getElementById('liveTimeClock');
        if (clockEl) clockEl.innerText = timeStr;

        if (now.getSeconds() % 3 === 0) {
            const quant = runQuantAnalysis(currentChartAsset);
            const tickEl = document.getElementById('chartLiveTickPrice');
            if (tickEl) tickEl.innerText = quant.currentPrice;

            const modal = document.getElementById('signalModal');
            if (modal && !modal.classList.contains('hidden')) {
                updateModalSignalAssetUI(currentModalSignalAsset);
            }
        }
    }, 1000);
}

window.onload = function() {
    lucide.createIcons();
    startLiveClock();
    runGuardrailCheck();
    renderTradeInsightsPage();
    initTradingViewChart('OANDA:XAUUSD', '5');
    autoAlignPricesToChart();
    updateTradeStatusBadge();
    updateOpenTradePanel();
    makeTradePanelDraggable();
};
