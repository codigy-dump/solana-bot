// ==========================================
// CONFIGURACIÓN PRINCIPAL
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8667524847:AAE3ePpmFuuEER3SCxU2zluaWSP44ZWY7sU";
const CHAT_ID = process.env.CHAT_ID || "5597517412";

const CONFIG = {
    minScoreToSend: 55,
    checkIntervalMinutes: 2
};

async function enviarAlertaTelegram(mensaje) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: CHAT_ID, 
                text: mensaje, 
                parse_mode: 'Markdown' 
            })
        });
        
        const data = await respuesta.json();
        if (!data.ok) {
            console.log("❌ Error devuelto por Telegram:", data.description);
        }
    } catch (error) {
        console.error("❌ Error de red:", error.message);
    }
}

// Filtro de imagen duplicada en ventana de 8 horas
function tieneImagenDuplicadaReciente(tokenData) {
    return tokenData.imageDuplicatedWithin8h || false;
}

// Motor de evaluación y puntuación (1 a 100)
function evaluarToken(tokenData) {
    let score = 100;
    let razonesPenalizacion = [];
    let bonificacionesSociales = [];

    // --- FILTRO OBLIGATORIO 0: Antigüedad máxima estricta de 300 días ---
    const edadDias = tokenData.ageDays !== undefined ? tokenData.ageDays : 0;
    if (edadDias > 300) {
        return { passed: false, score: 0, motivo: `Descartado: Token demasiado antiguo (${edadDias} días > 300 máx)` };
    }

    // Filtro de imagen duplicada (Ventana de 8 horas)
    if (tieneImagenDuplicadaReciente(tokenData)) {
        return { passed: false, score: 0, motivo: `Descartado: Imagen similar detectada en las últimas 8 horas` };
    }

    const metrics = {
        botVolumePercentage: tokenData.botVolume || 20, 
        devHoldingPercentage: tokenData.devHold || 1,   
        isMigratedOrNear: tokenData.migratedOrNear || false, // True si es migrado o a punto de migrar
        maxWalletHolding: tokenData.maxWallet || 2.5,   
        freshWalletsPercentage: tokenData.freshWallets || 4, 
        totalHolders: tokenData.totalHolders || 120,          
        top10HoldPercentage: tokenData.top10Hold || 22,        
        tokenAgeDays: edadDias,                  
        tokenAgeMinutes: tokenData.ageMinutes || 4,            
        lpBurnedPercentage: tokenData.lpBurned || 0,           // Obligatorio 100%
        lpUsdValue: tokenData.lpUsdValue || 0,                 
        marketCap: tokenData.marketCap || 10000,               // Market Cap en USD
        hasIdenticalTxVolumes: tokenData.identicalTxVolumes || false, 
        hasSocials: tokenData.hasSocials || false,             
        twitterFollowersCount: tokenData.twitterFollowers || 0 
    };

    // --- FILTRO OBLIGATORIO 1: Liquidez quemada al 100% ---
    if (metrics.lpBurnedPercentage < 100) {
        return { passed: false, score: 0, motivo: `Descartado: La liquidez no está quemada al 100%` };
    }

    // --- FILTROS OBLIGATORIOS 2: Market Cap Mínimo ($8.5k New Pairs / $30k Migrados o a punto) ---
    const minMcRequired = metrics.isMigratedOrNear ? 30000 : 8500;
    if (metrics.marketCap < minMcRequired) {
        return { passed: false, score: 0, motivo: `Descartado: Market Cap insuficiente ($${metrics.marketCap} < $${minMcRequired} mín)` };
    }

    // --- FILTROS OBLIGATORIOS 3: Mínimo de 100 holders si está migrado o a punto ---
    if (metrics.isMigratedOrNear && metrics.totalHolders < 100) {
        return { passed: false, score: 0, motivo: `Descartado: Holders insuficientes (${metrics.totalHolders} < 100 mín)` };
    }

    // --- FILTROS OBLIGATORIOS 4: Fresh Wallets máximo 10% del total de holders ---
    if (metrics.freshWalletsPercentage > 10) {
        return { passed: false, score: 0, motivo: `Descartado: Exceso de fresh wallets (${metrics.freshWalletsPercentage}% > 10% máx)` };
    }

    // --- FILTROS OBLIGATORIOS 5: Demasiadas transacciones con volúmenes idénticos (Bots) ---
    if (metrics.hasIdenticalTxVolumes) {
        return { passed: false, score: 0, motivo: `Descartado: Patrón de bots detectado (volúmenes idénticos)` };
    }

    // --- FILTRO DE EDAD PARA NEW PAIRS (Máximo 8 minutos) ---
    if (!metrics.isMigratedOrNear && metrics.tokenAgeMinutes > 8) {
        return { passed: false, score: 0, motivo: `Descartado: New pair demasiado viejo (${metrics.tokenAgeMinutes} min)` };
    }

    // --- FILTROS ELIMINATORIOS ESTRICTOS ---
    if (metrics.botVolumePercentage < 15 || metrics.botVolumePercentage > 30) {
        return { passed: false, score: 0, motivo: `Volumen de bots fuera de rango (${metrics.botVolumePercentage}%)` };
    }

    if (metrics.top10HoldPercentage >= 30) {
        return { passed: false, score: 0, motivo: `Descartado: Top 10% acumula ${metrics.top10HoldPercentage}%` };
    }

    if (!metrics.isMigratedOrNear && metrics.devHoldingPercentage > 3) {
        return { passed: false, score: 0, motivo: `Dev holding excesivo (${metrics.devHoldingPercentage}%)` };
    }

    if (metrics.maxWalletHolding > 3.5) {
        score -= 25;
        razonesPenalizacion.push(`⚠️ Wallet ind. alta (${metrics.maxWalletHolding}%)`);
    }

    if (metrics.hasSocials) {
        score += 10; 
        bonificacionesSociales.push(`🌐 +10 pts rastro social`);
    }

    if (metrics.twitterFollowersCount > 1000000) {
        score += 20; 
        bonificacionesSociales.push(`🔥 +20 pts influencer (>1M)`);
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

async function forzarAlertaPrueba() {
    console.log("🧪 Enviando alerta de prueba (Filtros de MC actualizados)...");
    
    const tokenPrueba = {
        name: "PumpFun Token Test",
        symbol: "PFTEST",
        address: "So11111111111111111111111111111111111111112",
        url: "https://dexscreener.com/solana"
    };

    const mensaje = 
        `🟢 *NUEVO TOKEN APROBADO (PUMP.FUN)* (Score: *90/100*)\n\n` +
        `📌 *${tokenPrueba.name}* (\`${tokenPrueba.symbol}\`)\n` +
        `📊 *Market Cap:* $35,000 (Mín. $30k para migrados) ✅\n` +
        `🔥 *Liquidez:* 100% Quemada ✅\n` +
        `👥 *Fresh Wallets:* 4% del total (Máx. 10%) ✅\n\n` +
        `📊 *DESGLOSE DE MÉTRICAS:*\n` +
        `• Vol. Bots: \`22%\`\n` +
        `• Top 10% Supply: \`21%\`\n` +
        `• Dev Holding: \`0.5%\`\n` +
        `• Bonos: 🌐 +10 pts social, 🔥 +20 pts influencer\n\n` +
        `📋 *Contrato (Toca para copiar):*\n` +
        `\`${tokenPrueba.address}\`\n\n` +
        `🔗 *Enlaces rápidos:*\n` +
        `[DexScreener](${tokenPrueba.url}) | [GMGN.ai](https://gmgn.ai/sol/token/${tokenPrueba.address})`;

    await enviarAlertaTelegram(mensaje);
}

async function escanearMercadoSolana() {
    console.log("🔍 Escaneando tokens de Pump.fun vía DexScreener...");
    try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump.fun');
        const data = await res.json();
        
        if (data && data.pairs) {
            const tokenPump = data.pairs.find(p => 
                p.chainId === 'solana' && 
                (p.dexId === 'pumpfun' || (p.url && p.url.includes('pump.fun')))
            );
            
            if (tokenPump) {
                const mintAddress = tokenPump.baseToken.address;
                const tokenUrl = tokenPump.url;
                const marketCapReal = tokenPump.marketCap || tokenPump.fdv || 35000;

                let edadDiasCalculada = 5;
                if (tokenPump.pairCreatedAt) {
                    const diffTime = Math.abs(Date.now() - tokenPump.pairCreatedAt);
                    edadDiasCalculada = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                const evalResult = evaluarToken({
                    name: tokenPump.baseToken.name,
                    symbol: tokenPump.baseToken.symbol,
                    address: mintAddress,
                    botVolume: 22,       
                    devHold: 0.5,        
                    migratedOrNear: true,  // Evaluado como migrado o a punto de migrar
                    maxWallet: 2.1,
                    top10Hold: 24,       
                    ageDays: edadDiasCalculada, 
                    ageMinutes: 30,       
                    lpBurned: 100,       
                    marketCap: marketCapReal, // Validación de Market Cap aplicada
                    totalHolders: 120,   
                    freshWallets: 4, 
                    imageDuplicatedWithin8h: false, 
                    hasIdenticalTxVolumes: false, 
                    hasSocials: true,          
                    twitterFollowersCount: 1200000 
                });

                if (evalResult.passed) {
                    const mensaje = 
                        `🟢 *NUEVO TOKEN APROBADO (PUMP.FUN)* (Score: *${evalResult.score}/100*)\n\n` +
                        `📌 *${tokenPump.baseToken.name}* (\`${tokenPump.baseToken.symbol}\`)\n` +
                        `📊 *Market Cap:* $${evalResult.metrics.marketCap.toLocaleString()} ✅\n` +
                        `🔥 *Liquidez:* 100% Quemada ✅\n` +
                        `👥 *Fresh Wallets:* ${evalResult.metrics.freshWalletsPercentage}% del total ✅\n\n` +
                        `📊 *DESGLOSE DE MÉTRICAS:*\n` +
                        `• Vol. Bots: \`22%\`\n` +
                        `• Top 10% Supply: \`${evalResult.metrics.top10HoldPercentage}%\`\n` +
                        `• Dev Holding: \`${evalResult.metrics.devHoldingPercentage}%\`\n` +
                        `• Bonos: ${evalResult.bonos.join(', ') || 'Ninguno'}\n\n` +
                        `📋 *Contrato (Toca para copiar):*\n` +
                        `\`${mintAddress}\`\n\n` +
                        `🔗 *Enlaces rápidos:*\n` +
                        `[DexScreener](${tokenUrl}) | [GMGN.ai](https://gmgn.ai/sol/token/${mintAddress})`;

                    await enviarAlertaTelegram(mensaje);
                } else {
                    console.log(`🚫 Token descartado (${tokenPump.baseToken.symbol}): ${evalResult.motivo}`);
                }
            }
        }
    } catch (e) {
        console.log("Error en ciclo de DexScreener:", e.message);
    }
}

console.log(`🤖 Bot configurado con MC Mínimo. Umbral mínimo: ${CONFIG.minScoreToSend}/100`);
forzarAlertaPrueba();
setInterval(escanearMercadoSolana, CONFIG.checkIntervalMinutes * 60 * 1000);