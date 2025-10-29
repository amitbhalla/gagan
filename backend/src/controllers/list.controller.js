const ListModel = require('../models/list.model');
const logger = require('../config/logger');

class ListController {
  static getAll(req, res) {
    try {
      const lists = ListModel.getAll();
      res.json({ lists, total: lists.length });
    } catch (error) {
      logger.error('Get lists error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch lists' });
    }
  }

  static getById(req, res) {
    try {
      const list = ListModel.getById(req.params.id);

      if (!list) {
        return res.status(404).json({ error: 'List not found' });
      }

      res.json(list);
    } catch (error) {
      logger.error('Get list error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch list' });
    }
  }

  static create(req, res) {
    try {
      const { name, description, custom_fields } = req.body;

      const list = ListModel.create({ name, description, custom_fields });

      logger.info('List created', { id: list.id, name });
      res.status(201).json(list);
    } catch (error) {
      logger.error('Create list error', { error: error.message });
      res.status(500).json({ error: 'Failed to create list' });
    }
  }

  static update(req, res) {
    try {
      const { name, description, custom_fields } = req.body;
      const listId = req.params.id;

      const existing = ListModel.getById(listId);
      if (!existing) {
        return res.status(404).json({ error: 'List not found' });
      }

      const list = ListModel.update(listId, { name, description, custom_fields });

      logger.info('List updated', { id: listId });
      res.json(list);
    } catch (error) {
      logger.error('Update list error', { error: error.message });
      res.status(500).json({ error: 'Failed to update list' });
    }
  }

  static delete(req, res) {
    try {
      const listId = req.params.id;

      const existing = ListModel.getById(listId);
      if (!existing) {
        return res.status(404).json({ error: 'List not found' });
      }

      ListModel.delete(listId);

      logger.info('List deleted', { id: listId });
      res.json({ message: 'List deleted successfully' });
    } catch (error) {
      logger.error('Delete list error', { error: error.message });
      res.status(500).json({ error: 'Failed to delete list' });
    }
  }

  static getSubscribers(req, res) {
    try {
      const listId = req.params.id;
      const subscribers = ListModel.getSubscribers(listId);

      res.json({ subscribers, total: subscribers.length });
    } catch (error) {
      logger.error('Get subscribers error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch subscribers' });
    }
  }

  static addSubscriber(req, res) {
    try {
      const listId = req.params.id;
      const { contact_id, custom_field_values } = req.body;

      ListModel.addSubscriber(listId, contact_id, custom_field_values);

      logger.info('Subscriber added', { listId, contactId: contact_id });
      res.json({ message: 'Subscriber added successfully' });
    } catch (error) {
      logger.error('Add subscriber error', { error: error.message });
      res.status(500).json({ error: 'Failed to add subscriber' });
    }
  }

  static removeSubscriber(req, res) {
    try {
      const listId = req.params.id;
      const contactId = req.params.contactId;

      ListModel.removeSubscriber(listId, contactId);

      logger.info('Subscriber removed', { listId, contactId });
      res.json({ message: 'Subscriber removed successfully' });
    } catch (error) {
      logger.error('Remove subscriber error', { error: error.message });
      res.status(500).json({ error: 'Failed to remove subscriber' });
    }
  }
}

module.exports = ListController;
