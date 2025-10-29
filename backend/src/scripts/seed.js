const { db } = require('../config/database');
const { nanoid } = require('nanoid');

console.log('Starting database seeding...');

// Clear existing data
console.log('Clearing existing data...');
db.prepare('DELETE FROM message_events').run();
db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM campaigns').run();
db.prepare('DELETE FROM list_subscribers').run();
db.prepare('DELETE FROM contacts').run();
db.prepare('DELETE FROM lists').run();
db.prepare('DELETE FROM templates').run();
db.prepare('DELETE FROM links').run();

// Seed Templates
console.log('Seeding templates...');
const templates = [
  {
    name: 'Welcome Email',
    subject: 'Welcome to {{company_name}}! 🎉',
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1890ff;">Welcome {{first_name}}!</h1>
          <p>We're thrilled to have you join our community. Get ready for amazing content and exclusive offers.</p>
          <p>Here's what you can expect:</p>
          <ul>
            <li>Weekly newsletters with industry insights</li>
            <li>Exclusive product updates</li>
            <li>Special member-only discounts</li>
          </ul>
          <a href="https://example.com/get-started" style="display: inline-block; padding: 12px 24px; background: #1890ff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Get Started</a>
          <p style="color: #666; font-size: 12px; margin-top: 40px;">If you no longer wish to receive these emails, you can <a href="{{unsubscribe_url}}">unsubscribe</a>.</p>
        </body>
      </html>
    `,
    type: 'html'
  },
  {
    name: 'Product Launch Announcement',
    subject: 'Introducing Our Latest Product: {{product_name}}',
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #52c41a;">Big News, {{first_name}}!</h1>
          <p>We're excited to announce the launch of our newest product: <strong>{{product_name}}</strong></p>
          <img src="https://via.placeholder.com/600x300" style="width: 100%; border-radius: 8px;" alt="Product">
          <p>This game-changing solution will help you:</p>
          <ul>
            <li>Save time on repetitive tasks</li>
            <li>Increase productivity by 50%</li>
            <li>Streamline your workflow</li>
          </ul>
          <a href="https://example.com/products/new" style="display: inline-block; padding: 12px 24px; background: #52c41a; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Learn More</a>
          <p style="color: #666; font-size: 12px; margin-top: 40px;">Manage your preferences or <a href="{{unsubscribe_url}}">unsubscribe</a>.</p>
        </body>
      </html>
    `,
    type: 'html'
  },
  {
    name: 'Monthly Newsletter',
    subject: 'Your {{month}} Newsletter is Here! 📬',
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #722ed1;">Hello {{first_name}}!</h1>
          <p>Here's what's new this month:</p>
          <h2 style="color: #1890ff;">Industry Insights</h2>
          <p>The latest trends and best practices in email marketing.</p>
          <a href="https://example.com/blog/insights">Read Article</a>

          <h2 style="color: #1890ff; margin-top: 30px;">Customer Success Story</h2>
          <p>See how Company XYZ increased their conversion rate by 200%.</p>
          <a href="https://example.com/case-studies">View Case Study</a>

          <h2 style="color: #1890ff; margin-top: 30px;">Upcoming Webinar</h2>
          <p>Join us for a deep dive into advanced segmentation strategies.</p>
          <a href="https://example.com/webinar" style="display: inline-block; padding: 12px 24px; background: #722ed1; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Register Now</a>

          <p style="color: #666; font-size: 12px; margin-top: 40px;"><a href="{{unsubscribe_url}}">Unsubscribe</a> from future newsletters.</p>
        </body>
      </html>
    `,
    type: 'html'
  },
  {
    name: 'Special Offer',
    subject: '⚡ Limited Time: {{discount}}% Off Everything!',
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; text-align: center;">
          <h1 style="color: #fa8c16; font-size: 36px;">FLASH SALE! ⚡</h1>
          <h2>{{discount}}% OFF EVERYTHING</h2>
          <p style="font-size: 18px;">Hey {{first_name}}, this exclusive offer ends in 24 hours!</p>
          <div style="background: #fff2e8; padding: 20px; border-radius: 8px; margin: 30px 0;">
            <p style="font-size: 14px; margin: 0;">Use code:</p>
            <p style="font-size: 32px; font-weight: bold; color: #fa8c16; margin: 10px 0;">{{promo_code}}</p>
          </div>
          <a href="https://example.com/shop" style="display: inline-block; padding: 16px 32px; background: #fa8c16; color: white; text-decoration: none; border-radius: 4px; font-size: 18px; font-weight: bold;">Shop Now</a>
          <p style="color: #666; font-size: 12px; margin-top: 40px;">Not interested? <a href="{{unsubscribe_url}}">Unsubscribe</a></p>
        </body>
      </html>
    `,
    type: 'html'
  },
  {
    name: 'Re-engagement Campaign',
    subject: 'We Miss You, {{first_name}}! Come Back for 20% Off',
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f5222d;">We Miss You! 💔</h1>
          <p>Hi {{first_name}},</p>
          <p>It's been a while since we've seen you! We wanted to reach out and let you know we're still here for you.</p>
          <p>To welcome you back, here's an exclusive <strong>20% discount</strong> on your next purchase.</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Your Exclusive Code:</strong></p>
            <p style="font-size: 24px; font-weight: bold; color: #f5222d; margin: 10px 0;">WELCOME-BACK</p>
          </div>
          <a href="https://example.com/comeback" style="display: inline-block; padding: 12px 24px; background: #f5222d; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Claim Your Discount</a>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">We understand if our emails aren't for you. Feel free to <a href="{{unsubscribe_url}}">unsubscribe</a> anytime.</p>
        </body>
      </html>
    `,
    type: 'html'
  }
];

const templateIds = [];
const insertTemplate = db.prepare('INSERT INTO templates (name, subject, body, type) VALUES (?, ?, ?, ?)');
templates.forEach(template => {
  const result = insertTemplate.run(template.name, template.subject, template.body, template.type);
  templateIds.push(result.lastInsertRowid);
  console.log(`  Created template: ${template.name}`);
});

// Seed Lists
console.log('Seeding lists...');
const lists = [
  { name: 'Newsletter Subscribers', description: 'Main newsletter mailing list' },
  { name: 'Product Updates', description: 'Users interested in product announcements' },
  { name: 'VIP Customers', description: 'High-value customers' },
  { name: 'Trial Users', description: 'Users on free trial' },
  { name: 'Inactive Users', description: 'Users who haven\'t engaged in 90+ days' }
];

const listIds = [];
const insertList = db.prepare('INSERT INTO lists (name, description) VALUES (?, ?)');
lists.forEach(list => {
  const result = insertList.run(list.name, list.description);
  listIds.push(result.lastInsertRowid);
  console.log(`  Created list: ${list.name}`);
});

// Seed Contacts
console.log('Seeding contacts...');
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Jennifer', 'William', 'Lisa', 'James', 'Mary', 'Christopher', 'Patricia', 'Daniel', 'Jessica', 'Matthew', 'Ashley', 'Andrew', 'Amanda'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'business.io', 'startup.co'];

const contactIds = [];
const insertContact = db.prepare('INSERT INTO contacts (email, first_name, last_name, status) VALUES (?, ?, ?, ?)');

for (let i = 0; i < 50; i++) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${domain}`;
  const statuses = ['active', 'active', 'active', 'active', 'bounced', 'unsubscribed']; // Weighted toward active
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  const result = insertContact.run(email, firstName, lastName, status);
  contactIds.push(result.lastInsertRowid);
}
console.log(`  Created ${contactIds.length} contacts`);

// Seed List Subscribers (connect contacts to lists)
console.log('Seeding list subscribers...');
const insertSubscriber = db.prepare('INSERT INTO list_subscribers (list_id, contact_id, status) VALUES (?, ?, ?)');
let subscriberCount = 0;

contactIds.forEach(contactId => {
  // Each contact subscribes to 1-3 random lists
  const numLists = Math.floor(Math.random() * 3) + 1;
  const selectedLists = [];

  for (let i = 0; i < numLists; i++) {
    const listId = listIds[Math.floor(Math.random() * listIds.length)];
    if (!selectedLists.includes(listId)) {
      selectedLists.push(listId);
      insertSubscriber.run(listId, contactId, 'subscribed');
      subscriberCount++;
    }
  }
});
console.log(`  Created ${subscriberCount} list subscriptions`);

// Seed Campaigns
console.log('Seeding campaigns...');
const campaigns = [
  { name: 'Welcome Series - January', template_id: templateIds[0], list_id: listIds[0], status: 'sent' },
  { name: 'Product Launch Campaign', template_id: templateIds[1], list_id: listIds[1], status: 'sent' },
  { name: 'Monthly Newsletter - February', template_id: templateIds[2], list_id: listIds[0], status: 'sent' },
  { name: 'Flash Sale - Weekend Special', template_id: templateIds[3], list_id: listIds[2], status: 'sent' },
  { name: 'Re-engagement Campaign', template_id: templateIds[4], list_id: listIds[4], status: 'sent' },
  { name: 'Monthly Newsletter - March', template_id: templateIds[2], list_id: listIds[0], status: 'draft' },
  { name: 'VIP Exclusive Offer', template_id: templateIds[3], list_id: listIds[2], status: 'draft' }
];

const campaignIds = [];
const insertCampaign = db.prepare(`
  INSERT INTO campaigns (name, template_id, list_id, from_email, from_name, status, started_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

campaigns.forEach((campaign, index) => {
  const daysAgo = 30 - (index * 5);
  const startedAt = campaign.status === 'sent' ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() : null;
  const completedAt = campaign.status === 'sent' ? new Date(Date.now() - (daysAgo - 1) * 24 * 60 * 60 * 1000).toISOString() : null;

  const result = insertCampaign.run(
    campaign.name,
    campaign.template_id,
    campaign.list_id,
    'hello@example.com',
    'Example Company',
    campaign.status,
    startedAt,
    completedAt
  );
  campaignIds.push({ id: result.lastInsertRowid, status: campaign.status });
  console.log(`  Created campaign: ${campaign.name} (${campaign.status})`);
});

// Seed Messages and Events for sent campaigns
console.log('Seeding messages and events...');
const insertMessage = db.prepare(`
  INSERT INTO messages (campaign_id, contact_id, message_id, tracking_token, status, sent_at, delivered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertEvent = db.prepare(`
  INSERT INTO message_events (message_id, event_type, event_data, ip_address, user_agent, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertLink = db.prepare(`
  INSERT INTO links (campaign_id, original_url, short_code)
  VALUES (?, ?, ?)
`);

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
];

let messageCount = 0;
let eventCount = 0;

campaignIds.forEach(campaign => {
  if (campaign.status !== 'sent') return;

  // Create links for this campaign
  const campaignLinks = [
    { url: 'https://example.com/products', short: nanoid(8) },
    { url: 'https://example.com/blog', short: nanoid(8) },
    { url: 'https://example.com/pricing', short: nanoid(8) }
  ];

  campaignLinks.forEach(link => {
    insertLink.run(campaign.id, link.url, link.short);
  });

  // Get subscribers for this campaign's list
  const listId = campaigns.find(c => campaignIds.findIndex(ci => ci.id === campaign.id) === campaigns.indexOf(c)).list_id;
  const subscribers = db.prepare(`
    SELECT contact_id FROM list_subscribers
    WHERE list_id = ? AND status = 'subscribed'
    LIMIT 30
  `).all(listId);

  subscribers.forEach(sub => {
    const messageId = `<${nanoid(16)}@example.com>`;
    const trackingToken = nanoid(32);
    const sentAt = new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000).toISOString();

    // 95% delivery rate
    const isDelivered = Math.random() > 0.05;
    const status = isDelivered ? 'delivered' : (Math.random() > 0.5 ? 'bounced' : 'failed');
    const deliveredAt = isDelivered ? new Date(new Date(sentAt).getTime() + 60000).toISOString() : null;

    const result = insertMessage.run(
      campaign.id,
      sub.contact_id,
      messageId,
      trackingToken,
      status,
      sentAt,
      deliveredAt
    );
    messageCount++;

    const msgId = result.lastInsertRowid;

    // Only create events for delivered messages
    if (isDelivered) {
      // 60% open rate
      if (Math.random() > 0.4) {
        const openedAt = new Date(new Date(deliveredAt).getTime() + Math.random() * 24 * 60 * 60 * 1000).toISOString();
        insertEvent.run(
          msgId,
          'opened',
          JSON.stringify({ timestamp: openedAt }),
          `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          userAgents[Math.floor(Math.random() * userAgents.length)],
          openedAt
        );
        eventCount++;

        // 40% click rate (of those who opened)
        if (Math.random() > 0.6) {
          const clickedAt = new Date(new Date(openedAt).getTime() + Math.random() * 2 * 60 * 60 * 1000).toISOString();
          const clickedLink = campaignLinks[Math.floor(Math.random() * campaignLinks.length)];
          insertEvent.run(
            msgId,
            'clicked',
            JSON.stringify({ url: clickedLink.url, shortCode: clickedLink.short, timestamp: clickedAt }),
            `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            userAgents[Math.floor(Math.random() * userAgents.length)],
            clickedAt
          );
          eventCount++;
        }
      }

      // 2% unsubscribe rate
      if (Math.random() > 0.98) {
        const unsubAt = new Date(new Date(deliveredAt).getTime() + Math.random() * 48 * 60 * 60 * 1000).toISOString();
        insertEvent.run(
          msgId,
          'unsubscribed',
          JSON.stringify({ timestamp: unsubAt }),
          `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          userAgents[Math.floor(Math.random() * userAgents.length)],
          unsubAt
        );
        eventCount++;
      }
    }
  });
});

console.log(`  Created ${messageCount} messages`);
console.log(`  Created ${eventCount} events`);

console.log('\n✅ Database seeding completed successfully!');
console.log('\nSummary:');
console.log(`  Templates: ${templateIds.length}`);
console.log(`  Lists: ${listIds.length}`);
console.log(`  Contacts: ${contactIds.length}`);
console.log(`  Campaigns: ${campaignIds.length}`);
console.log(`  Messages: ${messageCount}`);
console.log(`  Events: ${eventCount}`);

process.exit(0);
