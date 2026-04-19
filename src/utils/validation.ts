import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  businessName: z.string().min(1, 'Business name is required').max(200),
  businessType: z.string().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone format').optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const contactSchema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone format').optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(['manual', 'indiamart', 'justdial', 'facebook', 'instagram', 'whatsapp', 'website', 'google']).optional(),
  notes: z.string().max(2000).optional(),
});

export const whatsappMessageSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  content: z.string().min(1, 'Message content is required').max(4096, 'Message too long'),
});

export const whatsappBulkMessageSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(1000, 'Maximum 1000 recipients per batch'),
  content: z.string().min(1, 'Message content is required').max(4096, 'Message too long'),
});

export const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200),
  type: z.enum(['whatsapp', 'email', 'sms', 'drip']),
  templateName: z.string().optional(),
  templateVars: z.record(z.string()).optional(),
  targetTags: z.array(z.string()).optional(),
  targetFilters: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
  dripSteps: z.array(z.object({
    delay: z.number(),
    template: z.string(),
  })).optional(),
});

export const leadSchema = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone format').optional(),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().max(200).optional(),
  product: z.string().max(200).optional(),
  requirement: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
});

export const aiGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  type: z.enum(['text', 'hashtags', 'caption', 'image', 'reply']).default('text'),
  model: z.string().optional(),
  options: z.object({
    maxTokens: z.number().optional(),
    temperature: z.number().min(0).max(2).optional(),
  }).optional(),
});

export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(error);
  }
};