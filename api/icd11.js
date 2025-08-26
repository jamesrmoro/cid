// /api/icd11.js
export const config = { runtime: 'edge' }; // Vercel Edge Runtime

const TOKEN_URL = 'https://icdaccessmanagement.who.int/connect/token';
const SEARCH_URL = 'https://id.who.int/icd/entity/search';
const SCOPE = 'icdapi_access';

// cache simples de token em memória do edge runtime
let cachedToken = null;
let tokenExp = 0; // epoch em ms

/* ============================
   Utils de resposta e CORS
   ============================ */
function withCors(body, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
    }
    return new Response(body, { ...init, headers });
}

/* ============================
   OAuth Token (OMS)
   ============================ */
async function getToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExp - 30_000) return cachedToken;

    const clientId = process.env.WHO_ICD_CLIENT_ID;
    const clientSecret = process.env.WHO_ICD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('config_error: Missing WHO_ICD_CLIENT_ID/WHO_ICD_CLIENT_SECRET');
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: SCOPE,
        client_id: clientId,
        client_secret: clientSecret,
    });

    const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`token_error: ${r.status} ${t}`);
    }

    const json = await r.json();
    cachedToken = json.access_token;
    const ttl = Number(json.expires_in || 3500) * 1000; // segundos -> ms
    tokenExp = Date.now() + ttl;
    return cachedToken;
}

/* ============================
   Busca OMS + retry
   ============================ */
async function searchWHO({ token, q, lang, offset, limit, flatResults, useFlexisearch }) {
    const base = new URL(SEARCH_URL);
    base.searchParams.set('q', q);
    base.searchParams.set('flatResults', String(flatResults));
    base.searchParams.set('useFlexisearch', String(useFlexisearch));
    base.searchParams.set('offset', String(offset));
    base.searchParams.set('limit', String(limit));
    base.searchParams.set('highlightingEnabled', 'false');

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Accept-Language': lang, // pt
        'API-Version': 'v2',
    };

    // 1ª tentativa
    let r = await fetch(base.toString(), { headers, cache: 'no-store' });

    // Se for 5xx, tenta de novo sem flexisearch
    if (!r.ok && r.status >= 500) {
        const u2 = new URL(base.toString());
        u2.searchParams.set('useFlexisearch', 'false');
        r = await fetch(u2.toString(), { headers, cache: 'no-store' });
    }

    if (!r.ok) {
        const txt = await r.text().catch(() => '');
        return { ok: false, status: r.status, details: txt };
    }

    const data = await r.json().catch(() => ({}));
    return { ok: true, data };
}

/* ============================
   Handler
   ============================ */
export default async function handler(req) {
    // Pré-flight CORS
    if (req.method === 'OPTIONS') {
        return withCors(null, { status: 204 });
    }

    if (req.method !== 'GET') {
        return withCors(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
    }

    try {
        const { searchParams } = new URL(req.url);

        // parâmetros aceitos do app
        const q = (searchParams.get('q') || '').trim();
        const lang = (searchParams.get('lang') || 'pt').toLowerCase();
        const offset = Number(searchParams.get('offset') || '0') || 0;
        const limit = Math.min(Number(searchParams.get('limit') || '30') || 30, 100);
        const flatResults = searchParams.get('flatResults') === 'true';
        const useFlexisearch = searchParams.get('useFlexisearch') === 'true';

        if (!q || q.length < 2) {
            return withCors(JSON.stringify({ total: 0, results: [] }), { status: 200 });
        }

        // token OMS
        const token = await getToken();

        // consulta com retry inteligente
        const resp = await searchWHO({
            token,
            q,
            lang,
            offset,
            limit,
            flatResults,
            useFlexisearch,
        });

        if (!resp.ok) {
            return withCors(
                JSON.stringify({ error: 'who_error', status: resp.status, details: resp.details || '' }),
                { status: 502 }
            );
        }

        const data = resp.data || {};
        // Normaliza saída (algumas respostas vêm com destinationEntities)
        const list = Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.destinationEntities)
                ? data.destinationEntities
                : [];

        return withCors(
            JSON.stringify({
                total: Number(data?.total ?? list.length),
                results: list,
            }),
            { status: 200 }
        );
    } catch (err) {
        return withCors(
            JSON.stringify({ error: 'proxy_exception', details: String(err?.message || err) }),
            { status: 500 }
        );
    }
}
