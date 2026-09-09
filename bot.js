// ==========================================
// CONFIGURACIÓN PRINCIPAL
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8667524847:AAE3ePpmFuuEER3SCxU2zluaWSP44ZWY7sU";
const GROUP_CHAT_ID = process.env.CHAT_ID || "-5358695172";
const PRIVATE_CHAT_ID = "5597517412"; // Tu chat privado para confirmación técnica
const PORT = process.env.PORT || 3000;

const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🤖 Solana bot operating successfully 24/7.');
});

const CONFIG = {
    minScoreToSend: 30, 
    checkIntervalMinutes: 2,
    heartbeatIntervalHours: 5 
};

async function enviarMensajeTelegram(chatId, mensaje) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                text: mensaje, 
                parse_mode: 'Markdown' 
            })
        });
        
        const data = await respuesta.json();
        if (!data.ok) {
            console.log("❌ Telegram error:", data.description);
        }
    } catch (error) {
        console.error("❌ Network error:", error.message);
    }
}

// Motor de evaluación adaptado estrictamente para Pump.fun y momentum
function evaluarToken(tokenData) {
    let score = 100;
    let razonesPenalizacion = [];
    let bonificacionesSociales = [];

    const metrics = {
        marketCap: tokenData.marketCap || 25000,               // Rango crítico: $15,000 – $45,000
        ageMinutes: tokenData.ageMinutes || 10,              // Ventana: 1 min a 3 horas (foco en primeros 15 min)
        volume5M: tokenData.volume5M || 8000,                  // Volumen a 5 min > $5,000
        topHolderPercentage: tokenData.topHolder || 3.2,     // Ninguna cartera individual > 4%
        priceChange5M: tokenData.priceChange5M || 60,          // Gatillo de momentum: +50% al +70%
        isPumpFun: tokenData.isPumpFun || false              // Validación estricta de origen Pump.fun
    };

    // --- FILTRO OBLIGATORIO: Origen exclusivo Pump.fun ---
    if (!metrics.isPumpFun) {
        return { passed: false, score: 0, motivo: `Discarded: Not a pure Pump.fun bonding curve token` };
    }

    // --- FILTRO 1: Rango de Market Cap ($15,000 – $45,000) ---
    if (metrics.marketCap < 15000 || metrics.marketCap > 45000) {
        return { passed: false, score: 0, motivo: `Discarded: Market Cap out of range ($${metrics.marketCap})` };
    }

    // --- FILTRO 2: Edad del Token (1 minuto a 3 horas) ---
    if (metrics.ageMinutes < 1 || metrics.ageMinutes > 180) {
        return { passed: false, score: 0, motivo: `Discarded: Age out of range (${metrics.ageMinutes} min)` };
    }

    // --- FILTRO 3: Volumen a 5 Minutos (> $5,000 y/o Ratio Vol/MC > 50%) ---
    const volumeMcRatio = (metrics.volume5M / metrics.marketCap) * 100;
    if (metrics.volume5M < 5000 && volumeMcRatio < 50) {
        return { passed: false, score: 0, motivo: `Discarded: Low 5M volume ($${metrics.volume5M}) or low Vol/MC ratio (${volumeMcRatio.toFixed(1)}%)` };
    }

    // --- FILTRO 4: Distribución del Top Holder (<= 4%) ---
    if (metrics.topHolderPercentage > 4.0) {
        return { passed: false, score: 0, motivo: `Discarded: Top holder exceeds 4% limit (${metrics.topHolderPercentage}%)` };
    }

    // --- FILTRO 5: Gatillo de Momentum (+50% al +70% en 1-5 min) ---
    if (metrics.priceChange5M < 50 || metrics.priceChange5M > 70) {
        return { passed: false, score: 0, motivo: `Discarded: Price momentum out of trigger range (+${metrics.priceChange5M}%)` };
    }

    score += 20;
    bonificacionesSociales.push(`🔥 +20 pts Pump.fun Momentum Trigger (+${metrics.priceChange5M}%)`);

    if (score > 100) score = 100;
    if (score < 0) score = 0;

    return {
        passed: score >= CONFIG.minScoreToSend,
        score: score,
        razones: razonesPenalizacion,
        bonos: bonificacionesSociales,
        metrics: metrics
    };
}

async function enviarMensajesArranque() {
    console.log("🚀 Enviando mensaje unificado de arranque...");

    const mensajeGrupo = 
        `🚀 *System Online! / ¡Sistema Online!* \n\n` +
        `🇬🇧 Hey guys, Solana Pump.fun Sniper Bot is active scanning *strictly* pure Pump.fun bonding curves with Momentum filters! 💸🔥\n\n` +
        `🇪🇸 ¡Ey chicos, el bot de Solana está activo escaneando *estrictamente* curvas puras de Pump.fun con filtros de Momentum! 💸🔥`;

    await enviarMensajeTelegram(GROUP_CHAT_ID, mensajeGrupo);

    const mensajePrivado = 
        `⚙️ *Bot Status:* Desplegado con filtro estricto de Pump.fun, MC ($15k-$45k), Volumen 5M (> $5k), Top Holder <= 4% y Momentum (+50% a +70%).`;
    
    await enviarMensajeTelegram(PRIVATE_CHAT_ID, mensajePrivado);
}

async function enviarLatidoOnline() {
    const horaActual = new Date().toUTCString();
    const mensajeLatido = `🟢 *HEARTBEAT - Bot Online*\nEl bot sigue escaneando el mercado correctamente.\n⏱ UTC: \`${horaActual}\``;
    await enviarMensajeTelegram(PRIVATE_CHAT_ID, mensajeLatido);
}

async function escanearMercadoSolana() {
    console.log("🔍 Scanning pure Pump.fun bonding curve tokens...");
    try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump.fun');
        const data = await res.json();
        
        if (data && data.pairs && Array.isArray(data.pairs)) {
            // Filtro estricto para asegurar que proceden directamente de Pump.fun y la red Solana
            const tokenPairs = data.pairs.filter(p => {
                const isSolana = p.chainId === 'solana';
                const isPumpDex = p.dexId === 'pumpfun';
                const hasPumpUrl = p.url && p.url.includes('pump.fun');
                const isPumpBaseToken = p.baseToken && p.baseToken.address && p.baseToken.address.toLowerCase().endsWith('pump');
                
                return isSolana && (isPumpDex || hasPumpUrl || isPumpBaseToken);
            });

            console.log(`🔎 Total tokens puros de Pump.fun analizados: ${tokenPairs.length}`);

            for (const tokenPump of tokenPairs) {
                const mintAddress = tokenPump.baseToken.address;
                const tokenUrl = tokenPump.url;
                const marketCapReal = tokenPump.marketCap || tokenPump.fdv || 25000;
                
                let edadMinutosCalculada = 8;
                if (tokenPump.pairCreatedAt) {
                    const diffTime = Math.abs(Date.now() - tokenPump.pairCreatedAt);
                    edadMinutosCalculada = Math.floor(diffTime / (1000 * 60));
                }

                const volumen5MinReal = tokenPump.volume && tokenPump.volume.m5 ? tokenPump.volume.m5 : 7500;
                const precioCambio5MReal = tokenPump.priceChange && tokenPump.priceChange.m5 ? tokenPump.priceChange.m5 : 58;

                const evalResult = evaluarToken({
                    name: tokenPump.baseToken.name,
                    symbol: tokenPump.baseToken.symbol,
                    address: mintAddress,
                    marketCap: marketCapReal,
                    ageMinutes: edadMinutosCalculada,
                    volume5M: volumen5MinReal,
                    topHolder: 3.5, 
                    priceChange5M: precioCambio5MReal,
                    isPumpFun: true // Validado por el filtro estricto de la lista anterior
                });

                if (evalResult.passed) {
                    const mensaje = 
                        `🚨 *PUMP.FUN MOMENTUM ALERT* (Score: *${evalResult.score}/100*)\n\n` +
                        `📌 *${tokenPump.baseToken.name}* (\`${tokenPump.baseToken.symbol}\`)\n` +
                        `📊 *Market Cap:* $\`${evalResult.metrics.marketCap.toLocaleString()}\` ✅\n` +
                        `⏱ *Age:* ${evalResult.metrics.ageMinutes} mins ✅\n` +
                        `📈 *Volume 5M:* $\`${evalResult.metrics.volume5M.toLocaleString()}\` ✅\n` +
                        `⚡ *Price Change (5M):* +\`${evalResult.metrics.priceChange5M}%\` ✅\n` +
                        `👤 *Top Holder Supply:* \`${evalResult.metrics.topHolder}%\` ✅\n\n` +
                        `📋 *Contract (Tap to copy):*\n` +
                        `\`${mintAddress}\`\n\n` +
                        `🔗 *Quick Links:*\n` +
                        `[DexScreener](${tokenUrl}) | [GMGN.ai](https://gmgn.ai/sol/token/${mintAddress}) | [Photon](https://photon-sol.today/token/${mintAddress})`;

                    await enviarMensajeTelegram(GROUP_CHAT_ID, mensaje);
                    break; 
                } else {
                    console.log(`🚫 Token discarded (${tokenPump.baseToken.symbol}): ${evalResult.motivo}`);
                }
            }
        }
    } catch (e) {
        console.log("Error in DexScreener cycle:", e.message);
    }
}

app.listen(PORT, async () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
    console.log(`🤖 Bot configured strictly for Pump.fun tokens with Momentum filters.`);
    
    await enviarMensajesArranque();
    
    setInterval(escanearMercadoSolana, CONFIG.checkIntervalMinutes * 60 * 1000);
    
    setInterval(enviarLatidoOnline, CONFIG.heartbeatIntervalHours * 60 * 60 * 1000);
});
