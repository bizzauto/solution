import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';

const router = Router();
router.use(authenticate);

router.post('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { includeContacts = true, includeMessages = true, includeCampaigns = true } = req.body;

    const result = await BackupService.createBackup(req.user.businessId, {
      includeContacts,
      includeMessages,
      includeCampaigns,
    });

    res.json({ success: true, data: result, message: 'Backup created successfully' });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ success: false, error: 'Failed to create backup', details: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await BackupService.listBackups(req.user.businessId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ success: false, error: 'Failed to list backups', details: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const backup = await BackupService.getBackup(req.user.businessId, req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, error: 'Backup not found' });
    }
    res.json({ success: true, data: backup });
  } catch (error) {
    console.error('Get backup error:', error);
    res.status(500).json({ success: false, error: 'Failed to get backup', details: error.message });
  }
});

router.post('/:id/restore', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { clearExisting = false } = req.body;
    const result = await BackupService.restoreBackup(req.user.businessId, req.params.id, { clearExisting });
    res.json({ success: true, data: result, message: 'Backup restored successfully' });
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({ success: false, error: 'Failed to restore backup', details: error.message });
  }
});

router.delete('/:id', requireRole('OWNER'), async (req, res) => {
  try {
    await BackupService.deleteBackup(req.user.businessId, req.params.id);
    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete backup', details: error.message });
  }
});

router.post('/cleanup', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { keepCount = 5 } = req.body;
    const result = await BackupService.cleanupOldBackups(req.user.businessId, keepCount);
    res.json({ success: true, data: result, message: `Deleted ${result.deleted} old backups` });
  } catch (error) {
    console.error('Cleanup backups error:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup backups', details: error.message });
  }
});

export default router;