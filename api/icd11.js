// api/icd11.js
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    try {
        const { q = '', offset = '0', limit = '30', lang = 'pt' } = req.query;

        // 1) token
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
        const { access_token } = await tokenRes.json();

        // 2) busca MMS (AGORA com API-Version)
        const url = new URL('https://id.who.int/icd/release/11/mms/search');
        url.searchParams.set('q', q);
        url.searchParams.set('flatResults', 'true');
        url.searchParams.set('useFlexisearch', 'true');
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(limit));

        const apiRes = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Accept-Language': lang,     // pt / pt-BR / pt-PT
                'API-Version': 'v2',         // <- OBRIGATÓRIO
                Accept: 'application/json',
            },
        });

        const text = await apiRes.text(); // repassa a resposta como veio
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(apiRes.status).send(text || '{"results":[],"total":0}');
    } catch (e) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).json({ error: 'server_error', details: String(e) });
    }
}
