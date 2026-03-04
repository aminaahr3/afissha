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

-- ==================== SEED DATA ====================

-- Categories
INSERT INTO categories (id, name, name_ru) VALUES
  (1, 'concerts', 'Концерты'),
  (2, 'theater', 'Театр'),
  (3, 'sports', 'Спорт'),
  (4, 'exhibitions', 'Выставки'),
  (5, 'cinema', 'Кино'),
  (6, 'exhibitions', 'Выставки'),
  (7, 'museums', 'Музеи'),
  (8, 'quest', 'Квест комната'),
  (9, 'extreme', 'Экстрим'),
  (10, 'daily', 'Daily'),
  (11, 'rage_room', 'Комната гнева'),
  (12, 'billiards', 'Бильярд'),
  (13, 'bowling', 'Боулинг')
ON CONFLICT (id) DO NOTHING;
SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- Cities
INSERT INTO cities (id, name) VALUES
  (1, 'Москва'),
  (2, 'Санкт-Петербург'),
  (4, 'Сочи'),
  (5, 'Новосибирск'),
  (6, 'Альметьевск'),
  (7, 'Ангарск'),
  (8, 'Армавир'),
  (9, 'Архангельск'),
  (10, 'Астрахань'),
  (11, 'Балаково'),
  (12, 'Балашиха'),
  (13, 'Барнаул'),
  (14, 'Батайск'),
  (15, 'Белгород'),
  (16, 'Березники'),
  (17, 'Бийск'),
  (18, 'Братск'),
  (19, 'Брянск'),
  (20, 'Буйнакск'),
  (21, 'Великий Новгород'),
  (22, 'Владивосток'),
  (23, 'Владикавказ'),
  (24, 'Волгоград'),
  (25, 'Воронеж'),
  (26, 'Дербент'),
  (27, 'Екатеринбург'),
  (28, 'Краснодар'),
  (29, 'Красноярск'),
  (30, 'Ростов-на-Дону'),
  (31, 'Грозный'),
  (32, 'Хасавюрт'),
  (33, 'Казань')
ON CONFLICT (id) DO NOTHING;
SELECT setval('cities_id_seq', (SELECT MAX(id) FROM cities));

-- Event Templates
INSERT INTO event_templates (id, name, description, category_id, ticket_image_url, is_active, image_url) VALUES
  (1, 'Сальвадор Дали & Пабло Пикассо', E'Откройте мир двух гениев искусства и вдохновитесь их шедеврами. Уникальная экспозиция для всех любителей живописи.\n', 6, 'https://artchive.ru/res/media/img/oy800/exposition/c22/678496@2x.jpg', true, NULL),
  (2, 'VR Gallery', E'Полное погружение в виртуальные галереи с интерактивными экспонатами. Перенеситесь внутрь картин и создайте свои впечатления.\n', 6, 'https://www.marinabaysands.com/content/dam/revamp/ASMrevamp/VRgallery/VR-Gallery-Photo-Shoot-1-800x490.jpg', true, NULL),
  (3, 'Реальный космос', E'Путешествие по Вселенной в интерактивной выставке. Узнайте о планетах, звёздах и космосе своими глазами.\n', 6, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbou2jpU3dM2uViVkFfBxFw_vmZsD54TMMdQ&s', true, NULL),
  (4, 'Энди Уорхол и русское искусство', E'Поп-арт встречает классику: яркие работы и современные интерпретации. Идеально для любителей искусства и фотографий.\n', 6, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTRCG3ocLudpB89cv9srmMsuizRDpASa5HJvw&s', true, NULL),
  (5, 'Айвазовский. Кандинский. Живые полотна', E'Ожившие шедевры на мультимедийных экранах. Впечатляющее шоу для всей семьи.\n', 6, 'https://s3.afisha.ru/mediastorage/22/5e/a84badf567224497bf0dac225e22.jpg', true, NULL),
  (6, 'Музей восковых фигур', E'Реалистичные фигуры знаменитостей и исторических личностей. Сделайте фото с кумирами.\n', 7, 'https://kuda-kazan.ru/uploads/5acced441044b6f1ca31fe364a3003dd.jpg', true, NULL),
  (7, 'VR Музей', E'Интерактивные выставки в виртуальной реальности. Исследуйте экспозиции, как будто внутри них.\n', 7, 'https://vinchi-interactive.ru/wp-content/uploads/2023/08/vr-111-min.jpg', true, NULL),
  (8, 'Музей истории оружия', E'Коллекция оружия от древности до современности. Узнайте историю через уникальные экспонаты.\n', 7, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Weapon_history_museum_39.jpg/1200px-Weapon_history_museum_39.jpg', true, NULL),
  (9, 'Музей драгоценностей', E'Редкие украшения и драгоценные камни. Погрузитесь в мир роскоши и красоты.\n', 7, 'https://it.latuaitalia.ru/wp-content/uploads/2016/04/comune.vicenza.it_2.jpg', true, NULL),
  (10, 'Планетарий Saturn', 'Захватывающие космические шоу под куполом планетария. Путешествие среди звёзд для всей семьи.', 7, 'https://supernova.eso.org/static/archives/images/screen/upr_IMG_6320-cc.jpg', true, NULL),
  (11, 'Последняя экскурсия. Выжить любой ценой', 'Хоррор-квест с актёрами. Вы оказались в заброшенном музее с темной историей. Успейте выбраться за 60 минут.', 8, 'https://www.kvestinfo.ru/upload/iblock/30b/30b170bfe799ac5a951a534d0a58cce3_500x335.jpg', true, NULL),
  (12, 'Обитель проклятых', 'Мистический квест в атмосфере старинного особняка. Разгадайте тайну проклятия семьи.', 8, 'https://nsk.mir-kvestov.ru/uploads/quest_photos/34566/kvest-obitel-proklyatyh-quest-stars-323337fe_large.jpg?v=1761571873', true, NULL),
  (13, 'Побег из Алькатраса', 'Классический побег из тюрьмы. Логические загадки и механические головоломки.', 8, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRvdDgoVd6R71aL-58y3jST7r2uYtBwxVwflA&s', true, NULL),
  (14, 'Ограбление банка', 'Командный квест. Спланируйте и проведите идеальное ограбление.', 8, 'https://qimnata.com/dist/pict_rooms/NAX8ueFt.jpg', true, NULL),
  (15, 'Машина Времени', 'Научно-фантастический квест с путешествием по разным эпохам.', 8, 'https://staryj-oskol.mir-kvestov.ru/uploads/quest_photos/7652/kvest-mashina-vremeni-kvest-mashina-8b206cd5_large.jpg?v=1762855471', true, NULL),
  (16, 'Не дыши', 'Стелс-хоррор квест. Пробирайтесь через дом слепого убийцы.', 8, 'https://questhunter.info/wp-content/uploads/sites/9/2023/10/79.jpg', true, NULL),
  (17, 'Аутласт', 'Экстремальный хоррор-квест по мотивам игры. Только для смелых.', 8, 'https://mir-kvestov.ru/uploads/quest_photos/26054/kvest-outlast-quest-stars-3e78602f.jpg?v=1761644183', true, NULL),
  (18, 'Шерлок', 'Детективный квест. Расследуйте преступление вместе с великим сыщиком.', 8, 'https://topkvest.by/storage/thumb/quest_image/w800_h600_01K33PHCKAXSDG2C727MJBY1NW.jpeg', true, NULL),
  (19, 'Аэротруба', 'Полёт в аэродинамической трубе. Ощущение свободного падения без прыжка с самолёта.', 9, 'https://ulet.pro/sites/default/files/field/image/blog_post/aerotruba-bezopasnyy-sposob.jpg', true, NULL),
  (20, 'Прогулка на лошадях', 'Конная прогулка по живописным маршрутам с инструктором.', 9, 'https://игогошка.рф/wp-content/uploads/2021/05/5e4o9PQ2aRY-1024x683.jpg', true, NULL),
  (21, 'Картинг', 'Гонки на профессиональных картах. Соревнуйтесь с друзьями на скорость.', 9, 'https://avatars.mds.yandex.net/get-altay/14112077/2a00000191e1042ff59bc038768f19a644a3/L_height', true, NULL),
  (22, 'Пейнтбол', 'Командная игра в пейнтбол на оборудованной площадке.', 9, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_VzElIKBhcpDFrp1foiRI475b-PZrLRqXAg&s', true, NULL),
  (23, 'Прогулка на квадроциклах', 'Экстремальная поездка по бездорожью на мощных квадроциклах.', 9, 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/103/102695/images_file/all_all_big-t1585036987-r1w768h425q90zc1.jpg', true, NULL),
  (24, 'Профессиональный Тир', 'Стрельба из различных видов оружия под руководством инструктора.', 9, 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/106/105781/images_file/all_all_big-t1701090100-r1w568h318q90zc1.jpg', true, NULL),
  (25, 'Дегустация сыров и вин', 'Изысканная дегустация элитных сыров и вин с сомелье. 6 сортов вина и 8 видов сыра.', 10, 'https://s0.rbk.ru/v6_top_pics/media/img/2/37/347243227110372.webp', true, NULL),
  (26, 'Дегустация Пива', 'Крафтовые сорта пива от локальных пивоварен с закусками.', 10, 'https://2l-pub.ru/upload/medialibrary/72a/vt51vdajv2yqu8ewl936b3e32i8ou3ph.jpeg', true, NULL),
  (27, 'Дегустация Чая', 'Чайная церемония с редкими сортами чая из Китая, Японии и Индии.', 10, 'https://welcome.mosreg.ru/storage/images/event/2023/04/img_642e9feb3b4ba.jpg', true, NULL),
  (28, 'Кинотеатр на Крыше', 'Показ фильмов под открытым небом с потрясающим видом на город.', 10, 'https://lh6.googleusercontent.com/proxy/buGsdzad1b1jwTVf-lwwU1UR7E0_PJ1eROwVYcmt0lS9TZV1JXC2QXp-ztZvkzTl2BM9vdBObWiov4CPAf7zivUYyvGCrT1l', true, NULL),
  (29, 'Контактный зоопарк', 'Общение с ручными животными: кролики, козы, ламы, еноты и другие.', 10, 'https://avatars.mds.yandex.net/get-altay/11302718/2a000001901a6a33284430327503fe56714b/L_height', true, NULL),
  (30, 'Party Bus', 'Вечеринка в движении! Автобус с музыкой, светом и танцполом.', 10, 'https://www.limuzynki.pl/wpcu/2023/06/wnetrze-party-bus-3.jpg', true, NULL),
  (31, 'Выставка "Retro life"', 'Погружение в атмосферу 60-80х годов. Ретро-техника, мода и интерьеры.', 10, NULL, false, NULL),
  (32, 'Фестиваль японской культуры', 'Косплей, аниме, манга, японская кухня и мастер-классы.', 10, 'https://www.ru.emb-japan.go.jp/japan2018/common/images/article/mo7193-3.jpg', true, NULL),
  (33, 'Кулинарный мастер класс', 'Готовим изысканные блюда вместе с профессиональным шефом.', 10, 'https://tomsk.ultrapodarki.ru/upload/iblock/fce/fce734cf7f9f5588ba297d6595a87028.jpg', true, NULL),
  (34, 'Фестиваль иллюзионистов', 'Шоу-программа от лучших фокусников и иллюзионистов страны.', 10, 'https://www.afisha.uz/uploads/media/2024/04/d401374706701708c82b728d4964dcfa_l.jpg', true, NULL),
  (35, 'Гастро-тур "Tasty"', 'Гастрономическое путешествие по лучшим заведениям города.', 10, NULL, false, NULL),
  (36, 'Мотошоу "Extreme"', 'Каскадёрские трюки на мотоциклах. Огонь, скорость, адреналин!', 10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTPDX4LzFElEKGMHX567kVuLeeUEnt74ocsw&s', true, NULL),
  (37, 'Лазерное шоу с диджеем', 'Ночное лазерное шоу с лучшими диджеями города.', 10, 'https://i.ytimg.com/vi/G3WxM4mhEFA/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGBogLSh_MA8=&rs=AOn4CLBdS0Mhc_0gOtzesYrVnWSO7BF9Vg', true, NULL),
  (38, 'Романтика на закате', 'Романтический вечер на крыше с видом на закат. Шампанское и фуршет.', 10, 'https://i.pinimg.com/736x/62/ca/60/62ca60ed68725859f3a27d4c7193a71e.jpg', true, NULL),
  (39, 'Фестиваль BBQ & Smoke', 'Фестиваль барбекю: мясо на гриле, копчёности и street food.', 10, 'https://img.restoclub.ru/uploads/article/9/8/d/7/98d703b781f23fc2db166497664d8b42_w828_h552--big.jpg', true, NULL),
  (40, 'Комната гнева', 'Снимите стресс! Разбейте всё, что угодно: посуду, технику, мебель. Безопасно и весело.', 11, 'https://images.aif.by/007/836/a70cc50074418a1821b4d56dbc3362b4.jpg', true, NULL),
  (41, 'Бильярд', 'Профессиональные бильярдные столы. Русский бильярд и пул.', 12, 'https://www.billiard1.ru/upload/iblock/ac3/zgvvg7n3j88pmgo8vvr7checl7qxtw64.jpg', true, NULL),
  (42, 'Боулинг', 'Современные дорожки для боулинга. Идеально для семейного отдыха и корпоративов.', 13, 'https://www.kidsreview.ru/sites/default/files/sections/79.jpg?1', true, NULL)
ON CONFLICT (id) DO NOTHING;
SELECT setval('event_templates_id_seq', (SELECT MAX(id) FROM event_templates));

-- Event Template Images
INSERT INTO event_template_images (id, event_template_id, image_url, sort_order) VALUES
  (3, 24, 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/106/105781/images_file/all_all_big-t1701090100-r1w568h318q90zc1.jpg', 0),
  (4, 2, 'https://www.marinabaysands.com/content/dam/revamp/ASMrevamp/VRgallery/VR-Gallery-Photo-Shoot-1-800x490.jpg', 0),
  (5, 5, 'https://s3.afisha.ru/mediastorage/22/5e/a84badf567224497bf0dac225e22.jpg', 0),
  (6, 3, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbou2jpU3dM2uViVkFfBxFw_vmZsD54TMMdQ&s', 0),
  (7, 1, 'https://artchive.ru/res/media/img/oy800/exposition/c22/678496@2x.jpg', 0),
  (8, 4, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTRCG3ocLudpB89cv9srmMsuizRDpASa5HJvw&s', 0),
  (9, 7, 'https://vinchi-interactive.ru/wp-content/uploads/2023/08/vr-111-min.jpg', 0),
  (10, 6, 'https://kuda-kazan.ru/uploads/5acced441044b6f1ca31fe364a3003dd.jpg', 0),
  (11, 9, 'https://it.latuaitalia.ru/wp-content/uploads/2016/04/comune.vicenza.it_2.jpg', 0),
  (12, 8, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Weapon_history_museum_39.jpg/1200px-Weapon_history_museum_39.jpg', 0),
  (13, 10, 'https://supernova.eso.org/static/archives/images/screen/upr_IMG_6320-cc.jpg', 0),
  (14, 17, 'https://mir-kvestov.ru/uploads/quest_photos/26054/kvest-outlast-quest-stars-3e78602f.jpg?v=1761644183', 0),
  (15, 15, 'https://staryj-oskol.mir-kvestov.ru/uploads/quest_photos/7652/kvest-mashina-vremeni-kvest-mashina-8b206cd5_large.jpg?v=1762855471', 0),
  (16, 16, 'https://questhunter.info/wp-content/uploads/sites/9/2023/10/79.jpg', 0),
  (17, 12, 'https://nsk.mir-kvestov.ru/uploads/quest_photos/34566/kvest-obitel-proklyatyh-quest-stars-323337fe_large.jpg?v=1761571873', 0),
  (18, 14, 'https://qimnata.com/dist/pict_rooms/NAX8ueFt.jpg', 0),
  (19, 13, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRvdDgoVd6R71aL-58y3jST7r2uYtBwxVwflA&s', 0),
  (20, 11, 'https://www.kvestinfo.ru/upload/iblock/30b/30b170bfe799ac5a951a534d0a58cce3_500x335.jpg', 0),
  (21, 18, 'https://topkvest.by/storage/thumb/quest_image/w800_h600_01K33PHCKAXSDG2C727MJBY1NW.jpeg', 0),
  (22, 19, 'https://ulet.pro/sites/default/files/field/image/blog_post/aerotruba-bezopasnyy-sposob.jpg', 0),
  (23, 21, 'https://avatars.mds.yandex.net/get-altay/14112077/2a00000191e1042ff59bc038768f19a644a3/L_height', 0),
  (24, 22, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_VzElIKBhcpDFrp1foiRI475b-PZrLRqXAg&s', 0),
  (25, 23, 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/103/102695/images_file/all_all_big-t1585036987-r1w768h425q90zc1.jpg', 0),
  (26, 20, 'https://игогошка.рф/wp-content/uploads/2021/05/5e4o9PQ2aRY-1024x683.jpg', 0),
  (27, 30, 'https://www.limuzynki.pl/wpcu/2023/06/wnetrze-party-bus-3.jpg', 0),
  (28, 26, 'https://2l-pub.ru/upload/medialibrary/72a/vt51vdajv2yqu8ewl936b3e32i8ou3ph.jpeg', 0),
  (29, 27, 'https://welcome.mosreg.ru/storage/images/event/2023/04/img_642e9feb3b4ba.jpg', 0),
  (30, 25, 'https://s0.rbk.ru/v6_top_pics/media/img/2/37/347243227110372.webp', 0),
  (31, 28, 'https://lh6.googleusercontent.com/proxy/buGsdzad1b1jwTVf-lwwU1UR7E0_PJ1eROwVYcmt0lS9TZV1JXC2QXp-ztZvkzTl2BM9vdBObWiov4CPAf7zivUYyvGCrT1l', 0),
  (32, 29, 'https://avatars.mds.yandex.net/get-altay/11302718/2a000001901a6a33284430327503fe56714b/L_height', 0),
  (33, 33, 'https://tomsk.ultrapodarki.ru/upload/iblock/fce/fce734cf7f9f5588ba297d6595a87028.jpg', 0),
  (34, 37, 'https://i.ytimg.com/vi/G3WxM4mhEFA/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGBogLSh_MA8=&rs=AOn4CLBdS0Mhc_0gOtzesYrVnWSO7BF9Vg', 0),
  (35, 36, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTPDX4LzFElEKGMHX567kVuLeeUEnt74ocsw&s', 0),
  (36, 38, 'https://i.pinimg.com/736x/62/ca/60/62ca60ed68725859f3a27d4c7193a71e.jpg', 0),
  (37, 39, 'https://img.restoclub.ru/uploads/article/9/8/d/7/98d703b781f23fc2db166497664d8b42_w828_h552--big.jpg', 0),
  (39, 34, 'https://www.afisha.uz/uploads/media/2024/04/d401374706701708c82b728d4964dcfa_l.jpg', 0),
  (40, 32, 'https://www.ru.emb-japan.go.jp/japan2018/common/images/article/mo7193-3.jpg', 0),
  (41, 40, 'https://images.aif.by/007/836/a70cc50074418a1821b4d56dbc3362b4.jpg', 0),
  (42, 41, 'https://www.billiard1.ru/upload/iblock/ac3/zgvvg7n3j88pmgo8vvr7checl7qxtw64.jpg', 0),
  (43, 42, 'https://www.kidsreview.ru/sites/default/files/sections/79.jpg?1', 0)
ON CONFLICT (id) DO NOTHING;
SELECT setval('event_template_images_id_seq', (SELECT MAX(id) FROM event_template_images));

-- Default payment settings
INSERT INTO payment_settings (card_number, card_holder_name, bank_name, sbp_enabled)
SELECT '', '', '', true
WHERE NOT EXISTS (SELECT 1 FROM payment_settings);

-- Default site settings with LiveChat
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
