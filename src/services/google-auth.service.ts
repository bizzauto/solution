import { google } from 'googleapis';
import { prisma } from '../index.js';
import { hashPassword, generateToken } from '../utils/auth.js';

const OAuth2 = google.auth.OAuth2;

export class GoogleAuthService {
static getOAuth2Client() {
return new OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET,
process.env.GOOGLE_REDIRECT_URI || 'https://yourdomain.com/api/auth/google/callback'
);
}

static getAuthUrl() {
const oauth2Client = this.getOAuth2Client();

const scopes = [
'https://www.googleapis.com/auth/userinfo.email',
'https://www.googleapis.com/auth/userinfo.profile',
];

return oauth2Client.generateAuthUrl({
access_type: 'online',
scope: scopes,
prompt: 'select_account',
});
}

static async getUserInfo(code) {
const oauth2Client = this.getOAuth2Client();
const { tokens } = await oauth2Client.getToken(code);
oauth2Client.setCredentials(tokens);

const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
const { data } = await oauth2.userinfo.get();

return {
googleId: data.id,
email: data.email,
name: data.name,
picture: data.picture,
verified: data.verified_email,
};
}

static async findOrCreateUser(googleUser) {
let user = await prisma.user.findUnique({ where: { email: googleUser.email } });

if (user) {
// Update Google ID if not set
if (!user.googleId) {
user = await prisma.user.update({
where: { id: user.id },
data: { googleId: googleUser.googleId, avatar: googleUser.picture },
});
}
// Link Google account if different
} else {
// Check if email exists with different provider
const existingWithGoogle = await prisma.user.findFirst({
where: { googleId: googleUser.googleId }
});

if (existingWithGoogle) {
user = existingWithGoogle;
} else {
// Create new user with Google account
const business = await prisma.business.create({
data: {
name: `${googleUser.name}'s Business`,
type: 'general',
plan: 'FREE',
planStartedAt: new Date(),
},
});

user = await prisma.user.create({
data: {
email: googleUser.email,
name: googleUser.name,
googleId: googleUser.googleId,
avatar: googleUser.picture,
businessId: business.id,
role: 'OWNER',
isActive: true,
},
});
}
}

return user;
}

static async login(code) {
const googleUser = await this.getUserInfo(code);

if (!googleUser.verified) {
throw new Error('Google account email is not verified');
}

const user = await this.findOrCreateUser(googleUser);

const token = generateToken({
id: user.id,
email: user.email,
businessId: user.businessId,
role: user.role,
});

return {
user: {
id: user.id,
email: user.email,
name: user.name,
role: user.role,
avatar: user.avatar,
},
business: {
id: user.business?.id,
name: user.business?.name,
plan: user.business?.plan,
},
token,
};
}
}