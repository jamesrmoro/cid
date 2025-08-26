// /api/icd11.js
export const config = { runtime: 'edge' }; // rápido e barato no Vercel Edge

const TOKEN_URL = 'https://icdaccessmanagement.who.int/connect/token';
const SEARCH_URL = 'https://id.who.int/icd/entity/search';
const SCOPE = 'icdapi_access';

// cache simples de token em memória do edge runtime
let cachedToken = null;
let tokenExp = 0; // epoch em ms

async function getToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExp - 30_000) return cachedToken;

    const clientId = process.env.WHO_ICD_CLIENT_ID;
    const clientSecret = process.env.WHO_ICD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return Response.json(
            { error: 'config_error', details: 'Missing WHO_ICD_CLIENT_ID/WHO_ICD_CLIENT_SECRET' },
            { status: 500 }
        );
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
    // normalmente vem "expires_in" em segundos
    const ttl = Number(json.expires_in || 3500) * 1000;
    tokenExp = Date.now() + ttl;
    return cachedToken;
}

function withCors(body, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(body, { ...init, headers });
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return withCors(null, { status: 204 });
    }

    try {
        const { searchParams } = new URL(req.url);

        // parâmetros aceitos do app
        const q = searchParams.get('q') || '';
        const lang = (searchParams.get('lang') || 'pt').toLowerCase();
        const offset = Number(searchParams.get('offset') || '0');
        const limit = Math.min(Number(searchParams.get('limit') || '30'), 100);
        const flatResults = searchParams.get('flatResults') === 'true';
        const useFlexisearch = searchParams.get('useFlexisearch') === 'true';

        if (!q || q.trim().length < 2) {
            return withCors(JSON.stringify({ total: 0, results: [] }), { status: 200 });
        }

        const token = await getToken();

        const u = new URL(SEARCH_URL);
        u.searchParams.set('q', q);
        u.searchParams.set('flatResults', String(flatResults));
        u.searchParams.set('useFlexisearch', String(useFlexisearch));
        u.searchParams.set('offset', String(offset));
        u.searchParams.set('limit', String(limit));
        // outras flags úteis
        u.searchParams.set('highlightingEnabled', 'false');

        const r = await fetch(u.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Accept-Language': lang,   // força PT
                'API-Version': 'v2',       // versão atual da API da OMS
            },
            cache: 'no-store',
        });

        if (!r.ok) {
            const txt = await r.text().catch(() => '');
            // repassa erro de forma clara pro app
            return withCors(JSON.stringify({ error: 'who_error', status: r.status, details: txt }), { status: 502 });
        }

        const data = await r.json();

        // Normaliza saída (algumas respostas vêm com destinationEntities)
        const list = Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.destinationEntities)
                ? data.destinationEntities
                : [];

        // Já retornamos no formato que seu app entende
        return withCors(JSON.stringify({
            total: Number(data?.total ?? list.length),
            results: list,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        return withCors(
            JSON.stringify({ error: 'proxy_exception', details: String(err?.message || err) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
