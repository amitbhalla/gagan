const TemplateModel = require('../models/template.model');
const logger = require('../config/logger');

class TemplateController {
  static getAll(req, res) {
    try {
      const templates = TemplateModel.getAll();
      res.json({ templates, total: templates.length });
    } catch (error) {
      logger.error('Get templates error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  static getById(req, res) {
    try {
      const template = TemplateModel.getById(req.params.id);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json(template);
    } catch (error) {
      logger.error('Get template error', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  }

  static create(req, res) {
    try {
      const { name, subject, body, type } = req.body;

      const template = TemplateModel.create({ name, subject, body, type });

      logger.info('Template created', { id: template.id, name });
      res.status(201).json(template);
    } catch (error) {
      logger.error('Create template error', { error: error.message });
      res.status(500).json({ error: 'Failed to create template' });
    }
  }

  static update(req, res) {
    try {
      const { name, subject, body, type } = req.body;
      const templateId = req.params.id;

      const existing = TemplateModel.getById(templateId);
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const template = TemplateModel.update(templateId, { name, subject, body, type });

      logger.info('Template updated', { id: templateId });
      res.json(template);
    } catch (error) {
      logger.error('Update template error', { error: error.message });
      res.status(500).json({ error: 'Failed to update template' });
    }
  }

  static delete(req, res) {
    try {
      const templateId = req.params.id;

      const existing = TemplateModel.getById(templateId);
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      TemplateModel.delete(templateId);

      logger.info('Template deleted', { id: templateId });
      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      logger.error('Delete template error', { error: error.message });
      res.status(500).json({ error: 'Failed to delete template' });
    }
  }
}

module.exports = TemplateController;
