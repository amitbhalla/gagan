const { db } = require('../config/database');

class ListModel {
  static getAll() {
    const stmt = db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM list_subscribers WHERE list_id = l.id AND status = 'subscribed') as subscriber_count
      FROM lists l
      ORDER BY created_at DESC
    `);
    return stmt.all().map(list => ({
      ...list,
      custom_fields: list.custom_fields ? JSON.parse(list.custom_fields) : {}
    }));
  }

  static getById(id) {
    const stmt = db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM list_subscribers WHERE list_id = l.id AND status = 'subscribed') as subscriber_count
      FROM lists l
      WHERE l.id = ?
    `);
    const list = stmt.get(id);
    if (list) {
      list.custom_fields = list.custom_fields ? JSON.parse(list.custom_fields) : {};
    }
    return list;
  }

  static create(data) {
    const { name, description, custom_fields = {} } = data;
    const stmt = db.prepare(`
      INSERT INTO lists (name, description, custom_fields)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(name, description, JSON.stringify(custom_fields));
    return this.getById(result.lastInsertRowid);
  }

  static update(id, data) {
    const { name, description, custom_fields } = data;
    const stmt = db.prepare(`
      UPDATE lists
      SET name = ?, description = ?, custom_fields = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name, description, JSON.stringify(custom_fields), id);
    return this.getById(id);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM lists WHERE id = ?');
    return stmt.run(id);
  }

  static getSubscribers(listId) {
    const stmt = db.prepare(`
      SELECT c.*, ls.custom_field_values, ls.subscribed_at, ls.status as subscription_status
      FROM contacts c
      JOIN list_subscribers ls ON c.id = ls.contact_id
      WHERE ls.list_id = ? AND ls.status = 'subscribed'
      ORDER BY ls.subscribed_at DESC
    `);
    return stmt.all(listId).map(subscriber => ({
      ...subscriber,
      custom_field_values: subscriber.custom_field_values ? JSON.parse(subscriber.custom_field_values) : {}
    }));
  }

  static addSubscriber(listId, contactId, customFieldValues = {}) {
    const stmt = db.prepare(`
      INSERT INTO list_subscribers (list_id, contact_id, custom_field_values)
      VALUES (?, ?, ?)
      ON CONFLICT(list_id, contact_id) DO UPDATE SET
        status = 'subscribed',
        custom_field_values = excluded.custom_field_values,
        subscribed_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(listId, contactId, JSON.stringify(customFieldValues));
  }

  static removeSubscriber(listId, contactId) {
    const stmt = db.prepare(`
      UPDATE list_subscribers
      SET status = 'unsubscribed'
      WHERE list_id = ? AND contact_id = ?
    `);
    return stmt.run(listId, contactId);
  }

  static count() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM lists');
    return stmt.get().count;
  }
}

module.exports = ListModel;
