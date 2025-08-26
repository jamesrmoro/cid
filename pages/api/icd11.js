// pages/api/icd11.js
export default async function handler(req, res) {
    // Preflight CORS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    try {
        const { q = '', offset = '0', limit = '30', lang = 'pt' } = req.query;

        // 1) Token OAuth2 da OMS — SEMPRE no servidor
        const tokenRes = await fetch('https://icdaccessmanagement.who.int/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.ICD11_CLIENT_ID,
                client_secret: process.env.ICD11_CLIENT_SECRET,
                scope: 'icdapi_access',
                grant_type: 'client_credentials',
            }),
            cache: 'no-store',
        });

        if (!tokenRes.ok) {
            const txt = await tokenRes.text();
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(500).json({ error: 'token_error', details: txt });
        }

        const { access_token } = await tokenRes.json();

        // 2) Busca ICD-11 MMS (PT) — headers IMPORTANTES
        const url = new URL('https://id.who.int/icd/release/11/mms/search');
        url.searchParams.set('q', q);
        url.searchParams.set('flatResults', 'true');
        url.searchParams.set('useFlexisearch', 'true');
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(limit));

        const apiRes = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Accept-Language': lang, // 'pt' / 'pt-BR' / 'pt-PT'
                'API-Version': 'v2',     // ← OBRIGATÓRIO na ICD API
                Accept: 'application/json',
            },
            cache: 'no-store',
        });

        const text = await apiRes.text(); // pode vir vazio em 204
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(apiRes.status).send(text || '{"results":[],"total":0}');
    } catch (e) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: 'server_error', details: String(e) });
    }
}
