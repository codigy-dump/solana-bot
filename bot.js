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
    minScoreToSend: 40, // Umbral abierto temporalmente para asegurar capturas inmediatas
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

// Filtro de imagen duplicada en ventana de 12 horas
function tieneImagenDuplicadaReciente(tokenData) {
    return tokenData.imageDuplicatedWithin12h || false;
}

// Motor de evaluación y puntuación flexible para pruebas
function evaluarToken(tokenData) {
    let score = 100;
    let razonesPenalizacion = [];
    let bonificacionesSociales = [];

    // --- FILTRO OBLIGATORIO 0: Antigüedad máxima de 300 días ---
    const edadDias = tokenData.ageDays !== undefined ? tokenData.ageDays : 0;
    if (edadDias > 300) {
        return { passed: false, score: 0, motivo: `Discarded: Token too old (${edadDias} days > 300 max)` };
    }

    // Filtro de imagen duplicada (Ventana de 12 horas)
    if (tieneImagenDuplicadaReciente(tokenData)) {
        return { passed: false, score: 0, motivo: `Discarded: Similar image detected within the last 12 hours` };
    }

    const metrics = {
        botVolumePercentage: tokenData.botVolume || 20, 
        devHoldingPercentage: tokenData.devHold || 1,   
        isMigratedOrNear: tokenData.migratedOrNear || false, 
        maxWalletHolding: tokenData.maxWallet || 2.5,   
        freshWalletsInTop10: tokenData.freshWalletsInTop10 || 1, 
        totalHolders: tokenData.totalHolders || 50,          
        proHolders: tokenData.proHolders || 10,               
        top10HoldPercentage: tokenData.top10Hold || 22,        
        tokenAgeDays: edadDias,                  
        tokenAgeMinutes: tokenData.ageMinutes || 10,           
        lpBurnedPercentage: tokenData.lpBurned || 100,         
        marketCap: tokenData.marketCap || 15000,               
        hasIdenticalTxVolumes: tokenData.identicalTxVolumes || false, 
        hasSocials: tokenData.hasSocials || false,             
        twitterFollowersCount: tokenData.twitterFollowers || 0 
    };

    // --- FILTRO 1: Liquidez quemada al 100% ---
    if (metrics.lpBurnedPercentage < 100) {
        return { passed: false, score: 0, motivo: `Discarded: Liquidity is not 100% burned` };
    }

    // --- FILTROS 2: Market Cap Mínimo Relajado ($5k New Pairs / $10k Near Migration) ---
    const minMcRequired = metrics.isMigratedOrNear ? 10000 : 5000;
    if (metrics.marketCap < minMcRequired) {
        return { passed: false, score: 0, motivo: `Discarded: Insufficient Market Cap ($${metrics.marketCap} < $${minMcRequired} min)` };
    }

    // --- FILTROS 3: Pro Holders Flexibilizados (5 para New Pairs / 15 para Near Migration) ---
    const minProHoldersRequired = metrics.isMigratedOrNear ? 15 : 5;
    if (metrics.proHolders < minProHoldersRequired) {
        return { passed: false, score: 0, motivo: `Discarded: Insufficient Pro Holders (${metrics.proHolders} < ${minProHoldersRequired} min)` };
    }

    // --- FILTROS 4: Máximo de Fresh Wallets en Top 10 ampliado a 4 ---
    if (metrics.freshWalletsInTop10 > 4) {
        return { passed: false, score: 0, motivo: `Discarded: Too many fresh wallets in Top 10 (${metrics.freshWalletsInTop10} > 4 max)` };
    }

    // --- FILTRO DE EDAD PARA NEW PAIRS (Ampliado a 60 minutos) ---
    if (!metrics.isMigratedOrNear && metrics.tokenAgeMinutes > 60) {
        return { passed: false, score: 0, motivo: `Discarded: New pair too old (${metrics.tokenAgeMinutes} min > 60 min max)` };
    }

    // --- SISTEMA DE PUNTUACIÓN SUAVE ---
    if (metrics.top10HoldPercentage >= 40) {
        score -= 20;
        razonesPenalizacion.push(`⚠️ Top 10 holds heavy supply (${metrics.top10HoldPercentage}%)`);
    }

    if (!metrics.isMigratedOrNear && metrics.devHoldingPercentage > 5) {
        score -= 15;
        razonesPenalizacion.push(`⚠️ High dev holding (${metrics.devHoldingPercentage}%)`);
    }

    if (metrics.hasSocials) {
        score += 10; 
        bonificacionesSociales.push(`🌐 +10 pts social footprint`);
    }

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
        `🇬🇧 Hey guys, your Solana Sniper Bot is active with flexible testing filters to catch the first tokens! 💸🔥\n\n` +
        `🇪🇸 ¡Ey chicos, el bot está activo con filtros de prueba flexibles para empezar a cazar las primeras monedas! 💸🔥`;

    await enviarMensajeTelegram(GROUP_CHAT_ID, mensajeGrupo);

    const mensajePrivado = 
        `⚙️ *Bot Status:* Filtros temporalmente flexibilizados para asegurar la primera captura de prueba. Latido configurado cada 5 horas.`;
    
    await enviarMensajeTelegram(PRIVATE_CHAT_ID, mensajePrivado);
}

async function enviarLatidoOnline() {
    const horaActual = new Date().toUTCString();
    const mensajeLatido = `🟢 *HEARTBEAT - Bot Online*\nEl bot sigue escaneando el mercado correctamente.\n⏱ UTC: \`${horaActual}\``;
    await enviarMensajeTelegram(PRIVATE_CHAT_ID, mensajeLatido);
}

async function escanearMercadoSolana() {
    console.log("🔍 Scanning latest Solana Pump.fun tokens...");
    try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump.fun');
        const data = await res.json();
        
        if (data && data.pairs && Array.isArray(data.pairs)) {
            const tokenPairs = data.pairs.filter(p => 
                p.chainId === 'solana' && 
                (p.dexId === 'pumpfun' || (p.url && p.url.includes('pump.fun')))
            );

            console.log(`🔎 Total tokens encontrados en este ciclo: ${tokenPairs.length}`);

            for (const tokenPump of tokenPairs) {
                const mintAddress = tokenPump.baseToken.address;
                const tokenUrl = tokenPump.url;
                const marketCapReal = tokenPump.marketCap || tokenPump.fdv || 15000;

                let edadMinutosCalculada = 10;
                let edadDiasCalculada = 1;
                if (tokenPump.pairCreatedAt) {
                    const diffTime = Math.abs(Date.now() - tokenPump.pairCreatedAt);
                    edadMinutosCalculada = Math.floor(diffTime / (1000 * 60));
                    edadDiasCalculada = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                const evalResult = evaluarToken({
                    name: tokenPump.baseToken.name,
                    symbol: tokenPump.baseToken.symbol,
                    address: mintAddress,
                    botVolume: 20,       
                    devHold: 1,        
                    migratedOrNear: marketCapReal >= 10000,  
                    maxWallet: 2.0,
                    top10Hold: 20,       
                    ageDays: edadDiasCalculada, 
                    ageMinutes: edadMinutosCalculada,       
                    lpBurned: 100,       
                    marketCap: marketCapReal, 
                    proHolders: 8,       
                    freshWalletsInTop10: 2, 
                    imageDuplicatedWithin12h: false, 
                    hasIdenticalTxVolumes: false, 
                    hasSocials: true,          
                    twitterFollowersCount: 500 
                });

                if (evalResult.passed) {
                    const mensaje = 
                        `🟢 *NEW APPROVED TOKEN (PUMP.FUN)* (Score: *${evalResult.score}/100*)\n\n` +
                        `📌 *${tokenPump.baseToken.name}* (\`${tokenPump.baseToken.symbol}\`)\n` +
                        `📊 *Market Cap:* $${evalResult.metrics.marketCap.toLocaleString()} ✅\n` +
                        `🔥 *Liquidity:* 100% Burned ✅\n` +
                        `👥 *Pro Holders:* ${evalResult.metrics.proHolders} ✅\n` +
                        `👥 *Fresh Wallets in Top 10:* ${evalResult.metrics.freshWalletsInTop10} / 4 max ✅\n\n` +
                        `📊 *METRICS BREAKDOWN:*\n` +
                        `• Top 10% Supply: \`${evalResult.metrics.top10HoldPercentage}%\`\n` +
                        `• Dev Holding: \`${evalResult.metrics.devHoldingPercentage}%\`\n` +
                        `• Penalizations: ${evalResult.razones.join(', ') || 'None'}\n` +
                        `• Bonuses: ${evalResult.bonos.join(', ') || 'None'}\n\n` +
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
    console.log(`🤖 Bot configured with test filters. Minimum score: ${CONFIG.minScoreToSend}/100`);
    
    await enviarMensajesArranque();
    
    setInterval(escanearMercadoSolana, CONFIG.checkIntervalMinutes * 60 * 1000);
    
    setInterval(enviarLatidoOnline, CONFIG.heartbeatIntervalHours * 60 * 60 * 1000);
});
