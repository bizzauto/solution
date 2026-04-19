import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { GmailService } from '../services/gmail.service.js';

const router = Router();

// Get Gmail OAuth consent URL
router.get('/connect', authenticate, async (req, res) => {
try {
const authUrl = GmailService.getAuthUrl();
res.json({ success: true, data: { authUrl } });
} catch (error) {
res.status(500).json({ success: false, error: error.message });
}
});

// OAuth callback handler (called by Google after consent)
router.get('/oauth/callback', async (req, res) => {
try {
const { code, state, error: oauthError } = req.query;

if (oauthError) {
return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/integrations?gmail_error=${encodeURIComponent(oauthError)}`);
}

if (!code || !state) {
return res.status(400).json({ success: false, error: 'Missing code or state' });
}

// State contains businessId (base64 encoded for safety)
const businessId = Buffer.from(state, 'base64').toString('utf8');

await GmailService.getAccessToken(businessId, code);

res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/integrations?gmail_connected=true`);
} catch (error) {
console.error('Gmail OAuth callback error:', error);
res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/integrations?gmail_error=${encodeURIComponent(error.message)}`);
}
});

// Send email via Gmail
router.post('/send', authenticate, async (req, res) => {
try {
const { to, subject, html, text } = req.body;

if (!to || !subject || !html) {
return res.status(400).json({ success: false, error: 'to, subject, and html are required' });
}

const result = await GmailService.sendEmail(req.user.businessId, { to, subject, html, text });
res.json({ success: true, data: result });
} catch (error) {
console.error('Gmail send error:', error);
res.status(500).json({ success: false, error: error.message });
}
});

// Get Gmail connection status
router.get('/status', authenticate, async (req, res) => {
try {
const status = await GmailService.getGmailStatus(req.user.businessId);
res.json({ success: true, data: status });
} catch (error) {
res.status(500).json({ success: false, error: error.message });
}
});

// Disconnect Gmail
router.delete('/disconnect', authenticate, async (req, res) => {
try {
const result = await GmailService.revokeAccess(req.user.businessId);
res.json(result);
} catch (error) {
res.status(500).json({ success: false, error: error.message });
}
});

export default router;