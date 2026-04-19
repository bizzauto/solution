import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { prisma } from '../index.js';

const OAuth2 = google.auth.OAuth2;

export class GmailService {
static getOAuth2Client() {
return new OAuth2(
process.env.GMAIL_CLIENT_ID,
process.env.GMAIL_CLIENT_SECRET,
process.env.GMAIL_REDIRECT_URI || 'https://yourdomain.com/api/email/oauth/callback'
);
}

static getAuthUrl() {
const oauth2Client = this.getOAuth2Client();
const scopes = [
'https://www.googleapis.com/auth/gmail.send',
'https://www.googleapis.com/auth/gmail.readonly',
];

return oauth2Client.generateAuthUrl({
access_type: 'offline',
scope: scopes,
prompt: 'consent',
});
}

static async getAccessToken(businessId, code) {
const oauth2Client = this.getOAuth2Client();
oauth2Client.setCredentials({ code });

const { credentials } = await oauth2Client.getToken(code);
const { access_token, refresh_token, expiry_date } = credentials;

// Store tokens in business settings (encrypted)
await prisma.business.update({
where: { id: businessId },
data: {
gmailAccessToken: encrypt(access_token),
gmailRefreshToken: encrypt(refresh_token),
gmailTokenExpiry: new Date(expiry_date),
},
});

return credentials;
}

static async refreshAccessToken(businessId) {
const business = await prisma.business.findUnique({ where: { id: businessId } });

if (!business?.gmailRefreshToken) {
throw new Error('No refresh token available. User must authenticate first.');
}

const oauth2Client = this.getOAuth2Client();
oauth2Client.setCredentials({
refresh_token: decrypt(business.gmailRefreshToken),
});

const { credentials } = await oauth2Client.refreshAccessToken();
const { access_token, expiry_date } = credentials;

// Update stored access token
await prisma.business.update({
where: { id: businessId },
data: {
gmailAccessToken: encrypt(access_token),
gmailTokenExpiry: new Date(expiry_date),
},
});

return access_token;
}

static async getAuthenticatedClient(businessId) {
const business = await prisma.business.findUnique({ where: { id: businessId } });

if (!business?.gmailAccessToken) {
throw new Error('Gmail not connected. User must authenticate first.');
}

const oauth2Client = this.getOAuth2Client();
const tokenExpiry = business.gmailTokenExpiry ? new Date(business.gmailTokenExpiry).getTime() : 0;

// Refresh if token expired or about to expire (5 min buffer)
if (Date.now() >= tokenExpiry - 5 * 60 * 1000) {
const newAccessToken = await this.refreshAccessToken(businessId);
oauth2Client.setCredentials({ access_token: newAccessToken });
} else {
oauth2Client.setCredentials({
access_token: decrypt(business.gmailAccessToken),
});
}

return oauth2Client;
}

static async sendEmail(businessId, options) {
const { to, subject, html, text } = options;

try {
const auth = await this.getAuthenticatedClient(businessId);

const transporter = nodemailer.createTransport({
service: 'gmail',
auth: {
type: 'OAuth2',
user: business?.email || process.env.GMAIL_FROM_EMAIL,
clientId: process.env.GMAIL_CLIENT_ID,
clientSecret: process.env.GMAIL_CLIENT_SECRET,
refreshToken: (await prisma.business.findUnique({ where: { id: businessId } }))?.gmailRefreshToken,
accessToken: decrypt((await prisma.business.findUnique({ where: { id: businessId } }))?.gmailAccessToken),
},
});

const mailOptions = {
from: `"${business?.name || 'IndiaCRM'}" <${process.env.GMAIL_FROM_EMAIL}>`,
to,
subject,
html,
text: text || html.replace(/<[^>]*>/g, ''),
};

const info = await transporter.sendMail(mailOptions);
return { success: true, messageId: info.messageId };
} catch (error) {
console.error('Gmail send error:', error);
throw error;
}
}

static async revokeAccess(businessId) {
try {
const business = await prisma.business.findUnique({ where: { id: businessId } });

if (business?.gmailAccessToken) {
const oauth2Client = this.getOAuth2Client();
oauth2Client.setCredentials({
access_token: decrypt(business.gmailAccessToken),
});
await oauth2Client.revokeToken();
}

await prisma.business.update({
where: { id: businessId },
data: {
gmailAccessToken: null,
gmailRefreshToken: null,
gmailTokenExpiry: null,
},
});

return { success: true };
} catch (error) {
console.error('Gmail revoke error:', error);
return { success: false, error: error.message };
}
}

static async getGmailStatus(businessId) {
const business = await prisma.business.findUnique({ where: { id: businessId } });

return {
connected: !!(business?.gmailAccessToken && business?.gmailRefreshToken),
email: process.env.GMAIL_FROM_EMAIL,
expiresAt: business?.gmailTokenExpiry,
};
}
}