// pages/api/ok.js
export default function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
        return res.status(204).end();
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ ok: true, now: Date.now() });
}
