import { prisma } from '../index.js';
import crypto from 'crypto';
import { encrypt } from '../utils/auth.js';

export class BackupService {
  static async createBackup(businessId, options = {}) {
    const { includeContacts = true, includeMessages = true, includeCampaigns = true } = options;

    const backup = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      businessId,
      data: {},
    };

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        users: {
          select: { id: true, email: true, name: true, role: true, phone: true, isActive: true, createdAt: true }
        },
      },
    });
    backup.data.business = business;

    if (includeContacts) {
      backup.data.contacts = await prisma.contact.findMany({
        where: { businessId },
        include: {
          tags: true,
          activities: { take: 100, orderBy: { createdAt: 'desc' } },
        },
      });
      backup.data.tags = await prisma.tag.findMany({ where: { businessId } });
    }

    if (includeMessages) {
      backup.data.messages = await prisma.message.findMany({
        where: { businessId },
        take: 10000,
        orderBy: { createdAt: 'desc' },
      });
    }

    if (includeCampaigns) {
      backup.data.campaigns = await prisma.campaign.findMany({
        where: { businessId },
        include: { messages: true },
      });
    }

    backup.data.chatbotFlows = await prisma.chatbotFlow.findMany({ where: { businessId } });
    backup.data.automations = await prisma.automation.findMany({ where: { businessId } });
    backup.data.subscriptions = await prisma.subscription.findMany({ where: { businessId } });

    const backupJson = JSON.stringify(backup);
    const checksum = crypto.createHash('sha256').update(backupJson).digest('hex');

    const storedBackup = await prisma.backup.create({
      data: {
        businessId,
        data: encrypt(backupJson),
        checksum,
        size: Buffer.byteLength(backupJson, 'utf8'),
        status: 'completed',
      },
    });

    return {
      id: storedBackup.id,
      checksum,
      size: storedBackup.size,
      createdAt: storedBackup.createdAt,
      recordCount: {
        contacts: backup.data.contacts?.length || 0,
        messages: backup.data.messages?.length || 0,
        campaigns: backup.data.campaigns?.length || 0,
      },
    };
  }

  static async listBackups(businessId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const [backups, total] = await Promise.all([
      prisma.backup.findMany({
        where: { businessId },
        select: {
          id: true,
          checksum: true,
          size: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.backup.count({ where: { businessId } }),
    ]);

    return { backups, total, page, limit };
  }

  static async getBackup(businessId, backupId) {
    const backup = await prisma.backup.findFirst({
      where: { id: backupId, businessId },
    });

    if (!backup) return null;

    try {
      const decrypted = Buffer.from(backup.data, 'base64').toString('utf8');
      const checksum = crypto.createHash('sha256').update(decrypted).digest('hex');

      if (checksum !== backup.checksum) {
        throw new Error('Backup integrity check failed');
      }

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Failed to decrypt backup: ${error.message}`);
    }
  }

  static async restoreBackup(businessId, backupId, options = {}) {
    const { clearExisting = false } = options;
    const backup = await this.getBackup(businessId, backupId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    const restore = await prisma.$transaction(async (tx) => {
      if (clearExisting) {
        await tx.message.deleteMany({ where: { businessId } });
        await tx.contact.deleteMany({ where: { businessId } });
        await tx.tag.deleteMany({ where: { businessId } });
        await tx.campaign.deleteMany({ where: { businessId } });
        await tx.chatbotFlow.deleteMany({ where: { businessId } });
        await tx.automation.deleteMany({ where: { businessId } });
      }

      if (backup.data.contacts) {
        for (const contact of backup.data.contacts) {
          const { tags, activities, ...contactData } = contact;
          await tx.contact.upsert({
            where: { id: contact.id },
            update: { ...contactData, businessId },
            create: { ...contactData, businessId },
          });

          if (tags) {
            for (const tag of tags) {
              await tx.tag.upsert({
                where: { id: tag.id },
                update: { ...tag, businessId },
                create: { ...tag, businessId },
              });
            }
          }
        }
      }

      if (backup.data.campaigns) {
        for (const campaign of backup.data.campaigns) {
          const { messages, ...campaignData } = campaign;
          await tx.campaign.upsert({
            where: { id: campaign.id },
            update: { ...campaignData, businessId },
            create: { ...campaignData, businessId },
          });
        }
      }

      if (backup.data.chatbotFlows) {
        for (const flow of backup.data.chatbotFlows) {
          await tx.chatbotFlow.upsert({
            where: { id: flow.id },
            update: { ...flow, businessId },
            create: { ...flow, businessId },
          });
        }
      }

      if (backup.data.automations) {
        for (const automation of backup.data.automations) {
          await tx.automation.upsert({
            where: { id: automation.id },
            update: { ...automation, businessId },
            create: { ...automation, businessId },
          });
        }
      }

      await tx.backup.update({
        where: { id: backupId },
        data: { lastRestoredAt: new Date(), restoreCount: { increment: 1 } },
      });

      return { success: true, restoredAt: new Date().toISOString() };
    });

    return restore;
  }

  static async deleteBackup(businessId, backupId) {
    const backup = await prisma.backup.findFirst({
      where: { id: backupId, businessId },
    });

    if (!backup) {
      throw new Error('Backup not found');
    }

    await prisma.backup.delete({ where: { id: backupId } });
    return { success: true };
  }

  static async cleanupOldBackups(businessId, keepCount = 5) {
    const backups = await prisma.backup.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      skip: keepCount,
    });

    if (backups.length > 0) {
      await prisma.backup.deleteMany({
        where: { id: { in: backups.map((b) => b.id) } },
      });
    }

    return { deleted: backups.length };
  }
}