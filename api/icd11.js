// api/icd11.js (Vercel Serverless Function - Node runtime)
export default async function handler(req, res) {
    // CORS + preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    try {
        const { q = '', offset = '0', limit = '30', lang = 'pt' } = req.query;

        // 1) Obter token (NUNCA faça isso no front)
        const tokenRes = await fetch('https://icdaccessmanagement.who.int/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.ICD11_CLIENT_ID,
                client_secret: process.env.ICD11_CLIENT_SECRET,
                scope: 'icdapi_access',
                grant_type: 'client_credentials',
            }),
        });

        if (!tokenRes.ok) {
            const txt = await tokenRes.text();
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(500).json({ error: 'token_error', details: txt });
        }

        const { access_token } = await tokenRes.json();

        // 2) Buscar na OMS (ICD-11 MMS)
        const url = new URL('https://id.who.int/icd/release/11/mms/search');
        url.searchParams.set('q', q);
        url.searchParams.set('flatResults', 'true');
        url.searchParams.set('useFlexisearch', 'true');
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(limit));

        const apiRes = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Accept-Language': lang, // 'pt' -> títulos em português (quando disponíveis)
            },
        });

        const text = await apiRes.text(); // às vezes vem vazio com 204
        const data = text ? JSON.parse(text) : { results: [], total: 0 };

        // 3) Resposta para o app + CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json(data);
    } catch (e) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).json({ error: 'server_error', details: String(e) });
    }
}
