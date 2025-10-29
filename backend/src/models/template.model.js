const { db } = require('../config/database');

class TemplateModel {
  static getAll() {
    const stmt = db.prepare('SELECT * FROM templates ORDER BY created_at DESC');
    return stmt.all();
  }

  static getById(id) {
    const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
    return stmt.get(id);
  }

  static create(data) {
    const { name, subject, body, type = 'html' } = data;
    const stmt = db.prepare(`
      INSERT INTO templates (name, subject, body, type)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, subject, body, type);
    return this.getById(result.lastInsertRowid);
  }

  static update(id, data) {
    const { name, subject, body, type } = data;
    const stmt = db.prepare(`
      UPDATE templates
      SET name = ?, subject = ?, body = ?, type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name, subject, body, type, id);
    return this.getById(id);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
    return stmt.run(id);
  }

  static count() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM templates');
    return stmt.get().count;
  }
}

module.exports = TemplateModel;
