/**
 * Email Personalization Utility
 *
 * Processes merge tags in email templates
 * Supports:
 *   - {{first_name}}, {{last_name}}, {{email}}
 *   - {{custom_field_name}} from list custom fields
 *   - {{first_name|Default Value}} with default values
 *   - HTML and plain text templates
 */

const logger = require('../config/logger');

/**
 * Personalize email content with contact data
 * @param {string} content - Template content (HTML or text)
 * @param {Object} contact - Contact object
 * @param {Object} customFieldValues - Custom field values for this subscriber
 * @returns {string} Personalized content
 */
function personalizeContent(content, contact = {}, customFieldValues = {}) {
  if (!content) return '';

  let personalized = content;

  // Standard contact fields
  const standardFields = {
    email: contact.email || '',
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
  };

  // Merge standard fields and custom fields
  const allFields = {
    ...standardFields,
    ...customFieldValues
  };

  // Process all merge tags: {{field_name}} or {{field_name|Default Value}}
  personalized = personalized.replace(/\{\{([^}]+)\}\}/g, (match, fieldExpression) => {
    // Split by | to handle default values
    const parts = fieldExpression.split('|').map(p => p.trim());
    const fieldName = parts[0].toLowerCase();
    const defaultValue = parts[1] || '';

    // Get field value
    const value = allFields[fieldName];

    // Return value or default
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }

    return defaultValue;
  });

  return personalized;
}

/**
 * Personalize email subject
 * @param {string} subject - Subject template
 * @param {Object} contact - Contact object
 * @param {Object} customFieldValues - Custom field values
 * @returns {string} Personalized subject
 */
function personalizeSubject(subject, contact, customFieldValues) {
  return personalizeContent(subject, contact, customFieldValues);
}

/**
 * Personalize HTML body
 * @param {string} html - HTML template
 * @param {Object} contact - Contact object
 * @param {Object} customFieldValues - Custom field values
 * @returns {string} Personalized HTML
 */
function personalizeHtml(html, contact, customFieldValues) {
  return personalizeContent(html, contact, customFieldValues);
}

/**
 * Personalize plain text body
 * @param {string} text - Text template
 * @param {Object} contact - Contact object
 * @param {Object} customFieldValues - Custom field values
 * @returns {string} Personalized text
 */
function personalizeText(text, contact, customFieldValues) {
  return personalizeContent(text, contact, customFieldValues);
}

/**
 * Extract merge tags from content
 * @param {string} content - Template content
 * @returns {Array<string>} Array of field names used in template
 */
function extractMergeTags(content) {
  if (!content) return [];

  const matches = content.match(/\{\{([^}]+)\}\}/g) || [];
  const tags = matches.map(match => {
    // Remove {{ }} and get field name (before |)
    const fieldExpression = match.replace(/\{\{|\}\}/g, '');
    const fieldName = fieldExpression.split('|')[0].trim();
    return fieldName;
  });

  // Return unique tags
  return [...new Set(tags)];
}

/**
 * Validate that all merge tags can be resolved
 * @param {string} content - Template content
 * @param {Array<string>} availableFields - Available custom field names
 * @returns {Object} Validation result
 */
function validateMergeTags(content, availableFields = []) {
  const tags = extractMergeTags(content);
  const standardFields = ['email', 'first_name', 'last_name', 'full_name'];
  const allAvailableFields = [...standardFields, ...availableFields.map(f => f.toLowerCase())];

  const invalidTags = tags.filter(tag => !allAvailableFields.includes(tag.toLowerCase()));

  return {
    valid: invalidTags.length === 0,
    invalidTags,
    allTags: tags
  };
}

/**
 * Preview personalization with sample data
 * @param {string} content - Template content
 * @param {Object} sampleData - Sample contact and custom field data
 * @returns {string} Personalized preview
 */
function previewPersonalization(content, sampleData = {}) {
  const defaultContact = {
    email: 'john.doe@example.com',
    first_name: 'John',
    last_name: 'Doe'
  };

  const defaultCustomFields = {
    company: 'Acme Corp',
    industry: 'Technology'
  };

  const contact = { ...defaultContact, ...sampleData.contact };
  const customFields = { ...defaultCustomFields, ...sampleData.customFields };

  return personalizeContent(content, contact, customFields);
}

/**
 * Get merge tag suggestions for UI autocomplete
 * @param {Array<Object>} customFields - List custom fields definition
 * @returns {Array<Object>} Merge tag suggestions
 */
function getMergeTagSuggestions(customFields = []) {
  const standardTags = [
    { tag: '{{first_name}}', description: 'Contact first name' },
    { tag: '{{last_name}}', description: 'Contact last name' },
    { tag: '{{full_name}}', description: 'Contact full name' },
    { tag: '{{email}}', description: 'Contact email address' },
    { tag: '{{first_name|Friend}}', description: 'First name with default value' }
  ];

  const customTags = customFields.map(field => ({
    tag: `{{${field.name.toLowerCase()}}}`,
    description: field.label || field.name,
    type: field.type
  }));

  return [...standardTags, ...customTags];
}

/**
 * Batch personalize for multiple contacts
 * @param {string} template - Template content
 * @param {Array<Object>} contacts - Array of contact objects with customFieldValues
 * @returns {Array<Object>} Array of personalized content for each contact
 */
function batchPersonalize(template, contacts) {
  return contacts.map(contact => {
    try {
      return {
        contactId: contact.id,
        email: contact.email,
        personalized: personalizeContent(
          template,
          contact,
          contact.custom_field_values || {}
        ),
        success: true
      };
    } catch (error) {
      logger.error(`Failed to personalize for contact ${contact.id}:`, error);
      return {
        contactId: contact.id,
        email: contact.email,
        personalized: template,
        success: false,
        error: error.message
      };
    }
  });
}

module.exports = {
  personalizeContent,
  personalizeSubject,
  personalizeHtml,
  personalizeText,
  extractMergeTags,
  validateMergeTags,
  previewPersonalization,
  getMergeTagSuggestions,
  batchPersonalize
};
