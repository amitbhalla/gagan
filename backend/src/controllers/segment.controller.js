const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * Filter contacts in a list based on segment rules
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
exports.segmentList = (req, res) => {
  try {
    const { id } = req.params; // list ID
    const { filters } = req.body;

    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({
        error: 'Filters array is required'
      });
    }

    // Validate list exists
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Build SQL query based on filters
    const { query, params } = buildSegmentQuery(id, filters);

    logger.info(`Segmenting list ${id} with filters:`, filters);
    logger.debug('Generated query:', query);

    const stmt = db.prepare(query);
    const contacts = stmt.all(...params);

    res.json({
      contacts,
      count: contacts.length,
      filters
    });
  } catch (error) {
    logger.error(`Error segmenting list ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to segment list' });
  }
};

/**
 * Filter all contacts (not limited to a list)
 */
exports.segmentContacts = (req, res) => {
  try {
    const { filters } = req.body;

    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({
        error: 'Filters array is required'
      });
    }

    const { query, params } = buildContactSegmentQuery(filters);

    logger.info('Segmenting contacts with filters:', filters);
    logger.debug('Generated query:', query);

    const stmt = db.prepare(query);
    const contacts = stmt.all(...params);

    res.json({
      contacts,
      count: contacts.length,
      filters
    });
  } catch (error) {
    logger.error('Error segmenting contacts:', error);
    res.status(500).json({ error: error.message || 'Failed to segment contacts' });
  }
};

/**
 * Build SQL query for list segmentation
 * @param {number} listId - List ID
 * @param {Array} filters - Array of filter objects
 * @returns {Object} Query and params
 */
function buildSegmentQuery(listId, filters) {
  let query = `
    SELECT
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.status,
      c.created_at,
      ls.custom_field_values,
      ls.subscribed_at
    FROM contacts c
    JOIN list_subscribers ls ON c.id = ls.contact_id
    WHERE ls.list_id = ?
  `;

  const params = [listId];

  for (const filter of filters) {
    const { field, operator, value } = filter;

    if (!field || !operator) {
      continue;
    }

    if (field === 'status') {
      // Contact status filter
      query += buildStatusFilter(operator, value, params);
    } else if (field === 'email' || field === 'first_name' || field === 'last_name') {
      // Contact field filter
      query += buildContactFieldFilter(field, operator, value, params);
    } else if (field === 'subscribed_at') {
      // Subscription date filter
      query += buildDateFilter('ls.subscribed_at', operator, value, params);
    } else if (field === 'created_at') {
      // Contact creation date filter
      query += buildDateFilter('c.created_at', operator, value, params);
    } else {
      // Custom field filter
      query += buildCustomFieldFilter(field, operator, value, params);
    }
  }

  query += ' ORDER BY c.created_at DESC';

  return { query, params };
}

/**
 * Build SQL query for contact segmentation (no list)
 */
function buildContactSegmentQuery(filters) {
  let query = `
    SELECT
      id,
      email,
      first_name,
      last_name,
      status,
      created_at,
      updated_at
    FROM contacts
    WHERE 1=1
  `;

  const params = [];

  for (const filter of filters) {
    const { field, operator, value } = filter;

    if (!field || !operator) {
      continue;
    }

    if (field === 'status') {
      query += buildStatusFilter(operator, value, params);
    } else if (field === 'email' || field === 'first_name' || field === 'last_name') {
      query += buildContactFieldFilter(field, operator, value, params);
    } else if (field === 'created_at' || field === 'updated_at') {
      query += buildDateFilter(`contacts.${field}`, operator, value, params);
    } else if (field === 'engagement_score') {
      query += buildNumericFilter('engagement_score', operator, value, params);
    }
  }

  query += ' ORDER BY created_at DESC';

  return { query, params };
}

/**
 * Build status filter SQL
 */
function buildStatusFilter(operator, value, params) {
  if (operator === 'equals') {
    params.push(value);
    return ' AND c.status = ?';
  } else if (operator === 'not_equals') {
    params.push(value);
    return ' AND c.status != ?';
  } else if (operator === 'in') {
    const placeholders = value.map(() => '?').join(',');
    params.push(...value);
    return ` AND c.status IN (${placeholders})`;
  }
  return '';
}

/**
 * Build contact field filter SQL
 */
function buildContactFieldFilter(field, operator, value, params) {
  if (operator === 'equals') {
    params.push(value);
    return ` AND c.${field} = ?`;
  } else if (operator === 'not_equals') {
    params.push(value);
    return ` AND c.${field} != ?`;
  } else if (operator === 'contains') {
    params.push(`%${value}%`);
    return ` AND c.${field} LIKE ?`;
  } else if (operator === 'not_contains') {
    params.push(`%${value}%`);
    return ` AND c.${field} NOT LIKE ?`;
  } else if (operator === 'starts_with') {
    params.push(`${value}%`);
    return ` AND c.${field} LIKE ?`;
  } else if (operator === 'ends_with') {
    params.push(`%${value}`);
    return ` AND c.${field} LIKE ?`;
  } else if (operator === 'is_empty') {
    return ` AND (c.${field} IS NULL OR c.${field} = '')`;
  } else if (operator === 'is_not_empty') {
    return ` AND c.${field} IS NOT NULL AND c.${field} != ''`;
  }
  return '';
}

/**
 * Build date filter SQL
 */
function buildDateFilter(fieldName, operator, value, params) {
  if (operator === 'equals') {
    params.push(value);
    return ` AND date(${fieldName}) = date(?)`;
  } else if (operator === 'before') {
    params.push(value);
    return ` AND date(${fieldName}) < date(?)`;
  } else if (operator === 'after') {
    params.push(value);
    return ` AND date(${fieldName}) > date(?)`;
  } else if (operator === 'between') {
    if (Array.isArray(value) && value.length === 2) {
      params.push(value[0], value[1]);
      return ` AND date(${fieldName}) BETWEEN date(?) AND date(?)`;
    }
  } else if (operator === 'last_days') {
    params.push(parseInt(value));
    return ` AND ${fieldName} >= datetime('now', '-' || ? || ' days')`;
  }
  return '';
}

/**
 * Build numeric filter SQL
 */
function buildNumericFilter(field, operator, value, params) {
  if (operator === 'equals') {
    params.push(value);
    return ` AND ${field} = ?`;
  } else if (operator === 'greater_than') {
    params.push(value);
    return ` AND ${field} > ?`;
  } else if (operator === 'less_than') {
    params.push(value);
    return ` AND ${field} < ?`;
  } else if (operator === 'greater_than_or_equal') {
    params.push(value);
    return ` AND ${field} >= ?`;
  } else if (operator === 'less_than_or_equal') {
    params.push(value);
    return ` AND ${field} <= ?`;
  } else if (operator === 'between') {
    if (Array.isArray(value) && value.length === 2) {
      params.push(value[0], value[1]);
      return ` AND ${field} BETWEEN ? AND ?`;
    }
  }
  return '';
}

/**
 * Build custom field filter SQL
 */
function buildCustomFieldFilter(fieldName, operator, value, params) {
  if (operator === 'equals') {
    params.push(fieldName, value);
    return ` AND json_extract(ls.custom_field_values, '$.' || ?) = ?`;
  } else if (operator === 'not_equals') {
    params.push(fieldName, value);
    return ` AND json_extract(ls.custom_field_values, '$.' || ?) != ?`;
  } else if (operator === 'contains') {
    params.push(fieldName, `%${value}%`);
    return ` AND json_extract(ls.custom_field_values, '$.' || ?) LIKE ?`;
  } else if (operator === 'is_empty') {
    params.push(fieldName);
    return ` AND (json_extract(ls.custom_field_values, '$.' || ?) IS NULL OR json_extract(ls.custom_field_values, '$.' || ?) = '')`;
  } else if (operator === 'is_not_empty') {
    params.push(fieldName, fieldName);
    return ` AND json_extract(ls.custom_field_values, '$.' || ?) IS NOT NULL AND json_extract(ls.custom_field_values, '$.' || ?) != ''`;
  }
  return '';
}

/**
 * Get segment count (for preview without fetching all contacts)
 */
exports.getSegmentCount = (req, res) => {
  try {
    const { id } = req.params; // list ID
    const { filters } = req.body;

    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({
        error: 'Filters array is required'
      });
    }

    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const { query, params } = buildSegmentQuery(id, filters);

    // Replace SELECT clause with COUNT
    const countQuery = query.replace(
      /SELECT.*FROM/s,
      'SELECT COUNT(*) as count FROM'
    ).replace(/ORDER BY.*$/, '');

    const stmt = db.prepare(countQuery);
    const { count } = stmt.get(...params);

    res.json({ count });
  } catch (error) {
    logger.error(`Error getting segment count for list ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get segment count' });
  }
};

module.exports = exports;
