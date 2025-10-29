const ContactModel = require('../models/contact.model');
const logger = require('../config/logger');

class ContactController {
  static getAll(req, res) {
    try {
      const { status, search, limit } = req.query;
      const contacts = ContactModel.getAll({ status, search, limit: limit ? parseInt(limit) : null });
      const total = ContactModel.count({ status });

      res.json({ contacts, total });
    } catch (error) {
      logger.error('Get contacts error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch contacts' });
    }
  }

  static getById(req, res) {
    try {
      const contact = ContactModel.getById(req.params.id);

      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      // Get associated lists
      const lists = ContactModel.getLists(contact.id);

      res.json({ ...contact, lists });
    } catch (error) {
      logger.error('Get contact error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch contact' });
    }
  }

  static create(req, res) {
    try {
      const { email, first_name, last_name, status } = req.body;

      // Check if email already exists
      const existing = ContactModel.getByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const contact = ContactModel.create({ email, first_name, last_name, status });

      logger.info('Contact created', { id: contact.id, email });
      res.status(201).json(contact);
    } catch (error) {
      logger.error('Create contact error', { error: error.message });
      res.status(500).json({ error: 'Failed to create contact' });
    }
  }

  static update(req, res) {
    try {
      const { email, first_name, last_name, status } = req.body;
      const contactId = req.params.id;

      const existing = ContactModel.getById(contactId);
      if (!existing) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      // Check if email is being changed and already exists
      if (email !== existing.email) {
        const emailExists = ContactModel.getByEmail(email);
        if (emailExists) {
          return res.status(400).json({ error: 'Email already exists' });
        }
      }

      const contact = ContactModel.update(contactId, { email, first_name, last_name, status });

      logger.info('Contact updated', { id: contactId });
      res.json(contact);
    } catch (error) {
      logger.error('Update contact error', { error: error.message });
      res.status(500).json({ error: 'Failed to update contact' });
    }
  }

  static delete(req, res) {
    try {
      const contactId = req.params.id;

      const existing = ContactModel.getById(contactId);
      if (!existing) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      ContactModel.delete(contactId);

      logger.info('Contact deleted', { id: contactId });
      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      logger.error('Delete contact error', { error: error.message });
      res.status(500).json({ error: 'Failed to delete contact' });
    }
  }

  static bulkImport(req, res) {
    try {
      const { contacts } = req.body;

      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Invalid contacts data' });
      }

      const results = ContactModel.bulkCreate(contacts);

      logger.info('Bulk import completed', { count: results.length });
      res.json({ message: 'Contacts imported successfully', count: results.length });
    } catch (error) {
      logger.error('Bulk import error', { error: error.message });
      res.status(500).json({ error: 'Failed to import contacts' });
    }
  }

  static getStats(req, res) {
    try {
      const total = ContactModel.count();
      const active = ContactModel.count({ status: 'active' });
      const bounced = ContactModel.count({ status: 'bounced' });
      const unsubscribed = ContactModel.count({ status: 'unsubscribed' });

      res.json({
        total,
        active,
        bounced,
        unsubscribed
      });
    } catch (error) {
      logger.error('Get stats error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }
}

module.exports = ContactController;
