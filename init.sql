CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  name_ru VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS event_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  category_id INTEGER REFERENCES categories(id),
  ticket_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS event_template_images (
  id SERIAL PRIMARY KEY,
  event_template_id INTEGER REFERENCES event_templates(id),
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_template_addresses (
  id SERIAL PRIMARY KEY,
  event_template_id INTEGER REFERENCES event_templates(id),
  city_id INTEGER REFERENCES cities(id),
  venue_address TEXT
);

CREATE TABLE IF NOT EXISTS generated_links (
  id SERIAL PRIMARY KEY,
  link_code VARCHAR(255),
  event_template_id INTEGER REFERENCES event_templates(id),
  city_id INTEGER REFERENCES cities(id),
  event_date DATE,
  event_time TIME,
  venue_address TEXT,
  available_seats INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER,
  name VARCHAR(255),
  description TEXT,
  category_id INTEGER,
  city_id INTEGER,
  date DATE,
  time TIME,
  price DECIMAL,
  available_seats INTEGER,
  cover_image_url TEXT,
  slug VARCHAR(255),
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  event_id INTEGER,
  event_template_id INTEGER,
  admin_id INTEGER,
  link_code VARCHAR(255),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(255),
  customer_email VARCHAR(255),
  telegram_chat_id VARCHAR(255),
  telegram_username VARCHAR(255),
  seats_count INTEGER,
  total_price DECIMAL,
  order_code VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  tickets_json TEXT,
  event_date DATE,
  event_time TIME,
  city_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id SERIAL PRIMARY KEY,
  card_number VARCHAR(255),
  card_holder_name VARCHAR(255),
  bank_name VARCHAR(255),
  sbp_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  id SERIAL PRIMARY KEY,
  support_contact VARCHAR(255) DEFAULT 'https://t.me/support',
  support_label VARCHAR(255) DEFAULT 'Тех. поддержка',
  chat_script TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refund_links (
  id SERIAL PRIMARY KEY,
  refund_code VARCHAR(255),
  amount INTEGER,
  customer_name VARCHAR(255),
  card_number VARCHAR(255),
  card_expiry VARCHAR(10),
  refund_number VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  display_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_payment_settings (
  admin_id INTEGER PRIMARY KEY REFERENCES admins(id),
  card_number VARCHAR(255),
  card_holder_name VARCHAR(255),
  bank_name VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO payment_settings (card_number, card_holder_name, bank_name, sbp_enabled)
SELECT '', '', '', true
WHERE NOT EXISTS (SELECT 1 FROM payment_settings);

INSERT INTO site_settings (support_contact, support_label, chat_script)
SELECT 'https://t.me/support', 'Тех. поддержка',
'<!-- Start of LiveChat (www.livechat.com) code -->
<script>
    window.__lc = window.__lc || {};
    window.__lc.license = 19416545;
    window.__lc.integration_name = "manual_onboarding";
    window.__lc.product_name = "livechat";
    ;(function(n,t,c){function i(n){return e._h?e._h.apply(null,n):e._q.push(n)}var e={_q:[],_h:null,_v:"2.0",on:function(){i(["on",c.call(arguments)])},once:function(){i(["once",c.call(arguments)])},off:function(){i(["off",c.call(arguments)])},get:function(){if(!e._h)throw new Error("[LiveChatWidget] You can''t use getters before load.");return i(["get",c.call(arguments)])},call:function(){i(["call",c.call(arguments)])},init:function(){var n=t.createElement("script");n.async=!0,n.type="text/javascript",n.src="https://cdn.livechatinc.com/tracking.js",t.head.appendChild(n)}};!n.__lc.asyncInit&&e.init(),n.LiveChatWidget=n.LiveChatWidget||e}(window,document,[].slice))
</script>
<noscript><a href="https://www.livechat.com/chat-with/19416545/" rel="nofollow">Chat with us</a>, powered by <a href="https://www.livechat.com/?welcome" rel="noopener nofollow" target="_blank">LiveChat</a></noscript>
<!-- End of LiveChat code -->'
WHERE NOT EXISTS (SELECT 1 FROM site_settings);
