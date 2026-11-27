/**
 * Demo marketplace. Product rows:
 *   [title, category, brand, price in cents, "was" price in cents (0 = none), picture, palette, stock, description, "Spec:value|Spec:value"]
 */
export const PASSWORD = 'awning123';

export const SHOPS = [
  {
    key: 'kettle', owner: { name: 'Maya Okafor', email: 'maya@awning.test' }, name: 'Kettle & Crumb', color: '#D4402B', location: 'Bristol, UK',
    tagline: 'Things for slow mornings', connected: true,
    description: 'Mugs, kettles and table things for people who take their first coffee seriously. Everything is chosen by Maya and tested in her own kitchen before it reaches the shelf.',
    products: [
      ['Stoneware Mug, 350 ml', 'Home & Kitchen', 'Kettle & Crumb', 1800, 0, 'mug', 0, 60, 'A heavy, hand-glazed mug that keeps coffee warm to the last sip. Dishwasher safe.', 'Capacity:350 ml|Material:Stoneware|Care:Dishwasher safe'],
      ['Stoneware Mug, Set of 4', 'Home & Kitchen', 'Kettle & Crumb', 5900, 7200, 'mug', 4, 22, 'Four of our everyday mugs in one box, each glazed in a slightly different shade.', 'Pieces:4|Capacity:350 ml each|Material:Stoneware'],
      ['Gooseneck Pour-Over Kettle', 'Home & Kitchen', 'Halden', 6400, 7900, 'kettle', 7, 18, 'A slim spout for a slow, steady pour. Works on gas, electric and induction.', 'Capacity:1 litre|Material:Stainless steel|Hob:All types'],
      ['Enamel Stovetop Kettle', 'Home & Kitchen', 'Halden', 4800, 0, 'kettle', 1, 14, 'A whistling kettle in thick enamel, built to be left out on the hob.', 'Capacity:1.8 litres|Material:Enamelled steel'],
      ['Breakfast Bowl, Speckled', 'Home & Kitchen', 'Kettle & Crumb', 1600, 0, 'bowl', 6, 48, 'Deep enough for porridge, wide enough for ramen.', 'Diameter:16 cm|Material:Stoneware'],
      ['Mixing Bowl, Large', 'Home & Kitchen', 'Halden', 2900, 3600, 'bowl', 4, 20, 'A three-litre bowl with a pouring lip and a base that does not slide.', 'Capacity:3 litres|Material:Ceramic'],
      ['Soy Candle, Fig and Cedar', 'Home & Kitchen', 'Lowlight', 2200, 0, 'candle', 3, 35, 'Burns for about 40 hours with a warm, green fig scent.', 'Burn time:40 hours|Wax:Soy|Weight:220 g'],
      ['Soy Candle, Sea Salt', 'Home & Kitchen', 'Lowlight', 2200, 0, 'candle', 1, 0, 'Clean and bright, like an open window near the coast.', 'Burn time:40 hours|Wax:Soy|Weight:220 g'],
      ['Insulated Travel Bottle', 'Sports & Outdoors', 'Halden', 3200, 3800, 'bottle', 6, 40, 'Keeps drinks hot for 12 hours or cold for 24. Leakproof lid.', 'Capacity:500 ml|Material:Stainless steel'],
      ['Table Lamp, Linen Shade', 'Home & Kitchen', 'Lowlight', 7400, 0, 'lamp', 4, 9, 'A small lamp with a warm linen shade for shelves and bedside tables.', 'Height:38 cm|Bulb:E27, included|Cable:1.8 m'],
    ],
  },
  {
    key: 'circuit', owner: { name: 'Daniel Reyes', email: 'daniel@awning.test' }, name: 'Circuit Lane', color: '#2F6690', location: 'Austin, USA',
    tagline: 'Honest electronics, tested before they ship', connected: true,
    description: 'Audio, desk and travel electronics from small makers. We open every model ourselves and only list what we would keep.',
    products: [
      ['Wireless Over-Ear Headphones', 'Electronics', 'Aerial', 12900, 15900, 'headphones', 7, 25, 'Forty hours of battery, soft ear cushions and noise cancelling that takes the edge off a train.', 'Battery:40 hours|Connection:Bluetooth 5.3|Weight:250 g'],
      ['Studio Headphones, Wired', 'Electronics', 'Aerial', 8900, 0, 'headphones', 1, 16, 'A flat, detailed sound for mixing and long listening sessions.', 'Cable:3 m, detachable|Impedance:32 ohm'],
      ['Portable Bluetooth Speaker', 'Electronics', 'Aerial', 5900, 6900, 'speaker', 0, 38, 'Pocket sized, splash proof and far louder than it looks.', 'Battery:14 hours|Rating:IPX5|Weight:310 g'],
      ['Bookshelf Speaker, Pair', 'Electronics', 'Northwave', 18900, 0, 'speaker', 7, 7, 'Two compact speakers with a warm midrange. Amplifier built in.', 'Power:2 x 30 W|Inputs:Bluetooth, RCA, optical'],
      ['Mechanical Keyboard, 75%', 'Electronics', 'Tacto', 9900, 11900, 'keyboard', 5, 21, 'Hot-swappable switches and a gasket mount for a soft, quiet bottom-out.', 'Layout:75%, 84 keys|Switches:Linear, hot-swap|Connection:USB-C and Bluetooth'],
      ['Compact Keyboard, Low Profile', 'Electronics', 'Tacto', 6900, 0, 'keyboard', 1, 30, 'Thin enough for a laptop bag, with real mechanical switches.', 'Layout:65%|Battery:3 weeks|Connection:Bluetooth'],
      ['Power Bank, 20,000 mAh', 'Electronics', 'Northwave', 4500, 5500, 'charger', 6, 52, 'Charges a phone four times or a laptop once. Two USB-C ports.', 'Capacity:20,000 mAh|Output:65 W|Weight:340 g'],
      ['Fast Wall Charger, 65 W', 'Electronics', 'Northwave', 3400, 0, 'charger', 7, 44, 'One small charger for laptop, tablet and phone.', 'Ports:2 USB-C, 1 USB-A|Output:65 W'],
      ['Desk Lamp with Dimmer', 'Electronics', 'Tacto', 5200, 0, 'lamp', 1, 4, 'An adjustable arm, five brightness levels and a light that does not flicker.', 'Brightness:5 levels|Colour temperature:2700 to 5000 K'],
      ['Field Watch, 38 mm', 'Fashion', 'Northwave', 14500, 17500, 'watch', 7, 11, 'A simple quartz watch with a sapphire crystal and a canvas strap.', 'Case:38 mm steel|Water resistance:100 m|Strap:Canvas'],
    ],
  },
  {
    key: 'northfold', owner: { name: 'Ingrid Solberg', email: 'ingrid@awning.test' }, name: 'Northfold Outfitters', color: '#31572C', location: 'Bergen, Norway',
    tagline: 'Gear for wet weather and long walks', connected: true,
    description: 'Outdoor clothing and kit, chosen for a climate where it rains two days in three. If it survives Bergen, it will survive your commute.',
    products: [
      ['Waxed Field Jacket', 'Fashion', 'Northfold', 18900, 22900, 'jacket', 2, 13, 'A waxed cotton jacket that shrugs off rain and gets better with age.', 'Material:Waxed cotton|Fit:Regular|Pockets:4'],
      ['Merino Base Layer', 'Fashion', 'Northfold', 7900, 0, 'jacket', 7, 26, 'Warm when it is cold, cool when it is not, and never itchy.', 'Material:100% merino|Weight:180 gsm'],
      ['Rain Shell, Packable', 'Sports & Outdoors', 'Fjell', 12900, 14900, 'jacket', 6, 17, 'A fully taped shell that packs into its own pocket.', 'Waterproofing:20,000 mm|Weight:290 g'],
      ['Daypack, 22 Litre', 'Sports & Outdoors', 'Fjell', 8900, 10900, 'backpack', 2, 24, 'A padded back, a laptop sleeve and a rain cover in the base.', 'Volume:22 litres|Laptop:Up to 15 inch|Weight:720 g'],
      ['Roll-Top Commuter Pack', 'Sports & Outdoors', 'Fjell', 11500, 0, 'backpack', 7, 12, 'Welded seams and a roll top keep everything dry on a bike.', 'Volume:24 litres|Waterproof:Yes'],
      ['Trail Running Shoes', 'Sports & Outdoors', 'Fjell', 11900, 13900, 'shoe', 0, 19, 'Deep lugs for mud and a rock plate for everything else.', 'Drop:6 mm|Weight:280 g|Sizes:EU 38 to 47'],
      ['Leather Walking Boots', 'Fashion', 'Northfold', 16900, 0, 'shoe', 4, 8, 'Full-grain leather boots that can be resoled when the time comes.', 'Upper:Full-grain leather|Sole:Resoleable'],
      ['Steel Water Bottle, 750 ml', 'Sports & Outdoors', 'Fjell', 2400, 0, 'bottle', 1, 60, 'Single-wall steel, light enough to carry all day.', 'Capacity:750 ml|Weight:160 g'],
      ['Two-Person Trekking Tent', 'Sports & Outdoors', 'Fjell', 28900, 32900, 'tent', 2, 5, 'Pitches in four minutes and stands up to a proper gale.', 'Sleeps:2|Weight:1.9 kg|Season:3'],
      ['Match Football, Size 5', 'Sports & Outdoors', 'Kickwell', 2900, 3500, 'ball', 0, 33, 'A hand-stitched ball with a soft touch and a true flight.', 'Size:5|Panels:32'],
    ],
  },
  {
    key: 'paper', owner: { name: 'Kenji Watanabe', email: 'kenji@awning.test' }, name: 'Paper Lantern Books', color: '#A23B72', location: 'Osaka, Japan',
    tagline: 'Books and the tools to write your own', connected: true,
    description: 'A small bookshop that also sells the notebooks and pens we use ourselves. Paper that takes fountain pen ink without bleeding is a point of pride.',
    products: [
      ['Dot Grid Notebook, A5', 'Books & Stationery', 'Lantern', 1900, 0, 'notebook', 3, 80, 'Lies flat, takes fountain pen ink, and has 192 numbered pages.', 'Pages:192|Paper:100 gsm|Ruling:5 mm dot grid'],
      ['Pocket Notebooks, Pack of 3', 'Books & Stationery', 'Lantern', 1400, 1800, 'notebook', 4, 55, 'Three thin notebooks that fit a back pocket.', 'Pages:48 each|Size:9 x 14 cm'],
      ['Weekly Planner, Undated', 'Books & Stationery', 'Lantern', 2600, 0, 'notebook', 7, 30, 'Start any week of the year. One week per spread, notes opposite.', 'Weeks:54|Size:A5'],
      ['Brass Fountain Pen', 'Books & Stationery', 'Sumi', 6800, 7900, 'pen', 4, 15, 'A solid brass pen with a smooth steel nib. Develops a patina with use.', 'Nib:Medium, steel|Filling:Cartridge or converter'],
      ['Gel Pens, Set of 6', 'Books & Stationery', 'Sumi', 1200, 0, 'pen', 1, 90, 'Six colours of quick-drying gel ink for notes and margins.', 'Tip:0.5 mm|Colours:6'],
      ['The Quiet Kitchen (Hardback)', 'Books & Stationery', 'Lantern Press', 3200, 0, 'book', 0, 22, 'Sixty unfussy recipes for one or two people, with essays between them.', 'Pages:256|Format:Hardback'],
      ['A Field Guide to Small Gardens', 'Books & Stationery', 'Lantern Press', 2800, 3400, 'book', 2, 18, 'What to plant, when, and what to do when it goes wrong.', 'Pages:208|Format:Paperback'],
      ['Short Walks in Old Cities', 'Books & Stationery', 'Lantern Press', 2400, 0, 'book', 5, 27, 'Twenty essays on wandering without a plan.', 'Pages:184|Format:Paperback'],
      ['Desk Calendar Blocks', 'Books & Stationery', 'Lantern', 2100, 0, 'blocks', 4, 16, 'Wooden blocks that show any date of any year.', 'Material:Beech wood'],
    ],
  },
  {
    key: 'fern', owner: { name: 'Aisha Rahman', email: 'aisha@awning.test' }, name: 'Fern & Clay', color: '#2A9D8F', location: 'Lisbon, Portugal',
    tagline: 'Plants, pots and things that smell good', connected: true,
    description: 'House plants grown in our own greenhouse, pots thrown by local potters, and soap made in small batches. Plants are posted on Mondays so they never spend a weekend in a depot.',
    products: [
      ['Monstera Deliciosa, 40 cm', 'Garden', 'Fern & Clay', 3400, 0, 'plant', 2, 20, 'An easy, fast-growing plant with split leaves. Arrives potted.', 'Height:40 cm|Light:Bright, indirect|Water:Weekly'],
      ['Snake Plant', 'Garden', 'Fern & Clay', 2600, 3200, 'plant', 6, 28, 'Almost impossible to kill. Tolerates low light and missed waterings.', 'Height:35 cm|Light:Any|Water:Every 2 to 3 weeks'],
      ['Herb Trio: Basil, Mint, Thyme', 'Garden', 'Fern & Clay', 1800, 0, 'plant', 4, 34, 'Three kitchen herbs, ready to pick.', 'Pots:3 x 9 cm|Light:Sunny windowsill'],
      ['Terracotta Planter, 18 cm', 'Garden', 'Olaria', 2200, 0, 'planter', 0, 40, 'Hand-thrown terracotta with a drainage hole and saucer.', 'Diameter:18 cm|Includes:Saucer'],
      ['Glazed Planter, 24 cm', 'Garden', 'Olaria', 3900, 4600, 'planter', 6, 15, 'A heavy glazed pot in a deep sea green.', 'Diameter:24 cm|Finish:Reactive glaze'],
      ['Planter Set, Three Sizes', 'Garden', 'Olaria', 5400, 6400, 'planter', 3, 10, 'Three nesting planters for a windowsill family.', 'Sizes:12, 16 and 20 cm'],
      ['Olive Oil Soap, Lavender', 'Beauty & Care', 'Sabão', 900, 0, 'soap', 5, 120, 'Cold-process soap cured for six weeks. Gentle enough for faces.', 'Weight:120 g|Base:Olive oil'],
      ['Soap Trio Gift Box', 'Beauty & Care', 'Sabão', 2400, 2900, 'soap', 3, 45, 'Lavender, orange and unscented, wrapped in paper.', 'Bars:3 x 120 g'],
      ['Hand Cream, Unscented', 'Beauty & Care', 'Sabão', 1600, 0, 'bottle', 3, 50, 'Sinks in quickly and leaves no residue. For gardeners especially.', 'Volume:75 ml|Scent:None'],
      ['Beeswax Candle Pair', 'Beauty & Care', 'Sabão', 1900, 0, 'candle', 4, 26, 'Two pillar candles of pure beeswax with a faint honey scent.', 'Burn time:30 hours each'],
    ],
  },
  {
    key: 'rocket', owner: { name: 'Tomás Silva', email: 'tomas@awning.test' }, name: 'Pocket Rocket Toys', color: '#E09F3E', location: 'Porto, Portugal',
    tagline: 'Toys that outlast the afternoon', connected: false,
    description: 'Wooden toys, family games and things to build. No batteries, no screens, and nothing that plays a tune.',
    products: [
      ['Wooden Building Blocks, 50 Pieces', 'Toys & Games', 'Pocket Rocket', 3600, 4200, 'blocks', 4, 30, 'Fifty beech blocks in a cotton bag. Smooth edges, water-based paint.', 'Pieces:50|Age:1 year and up|Material:Beech'],
      ['Stacking Rainbow', 'Toys & Games', 'Pocket Rocket', 2900, 0, 'blocks', 3, 22, 'Seven arches that become bridges, tunnels and fences.', 'Pieces:7|Age:1 year and up'],
      ['Family Dice Game', 'Toys & Games', 'Tabletop & Co', 1800, 0, 'dice', 5, 44, 'Fast to learn, loud to play. Two to six players.', 'Players:2 to 6|Time:20 minutes|Age:7 and up'],
      ['Cooperative Board Game: Lighthouse', 'Toys & Games', 'Tabletop & Co', 3900, 4500, 'dice', 1, 14, 'Work together to keep the lamp lit until morning.', 'Players:1 to 4|Time:45 minutes|Age:8 and up'],
      ['Soft Play Ball', 'Toys & Games', 'Pocket Rocket', 1200, 0, 'ball', 3, 60, 'A light fabric ball that is safe indoors.', 'Diameter:15 cm|Age:6 months and up'],
      ['Junior Football, Size 3', 'Toys & Games', 'Kickwell', 1900, 2300, 'ball', 6, 37, 'A proper stitched ball in a size for small feet.', 'Size:3|Age:4 to 8'],
      ['My First Backpack', 'Toys & Games', 'Pocket Rocket', 2600, 0, 'backpack', 4, 18, 'Fits a lunch box, a jumper and one essential dinosaur.', 'Volume:7 litres|Age:3 to 6'],
      ['Colouring Pencils, Tin of 24', 'Toys & Games', 'Sumi', 1500, 0, 'pen', 0, 70, 'Soft, bright leads that do not snap when dropped.', 'Pieces:24|Core:3.8 mm'],
      ['Picture Book: The Slow Train', 'Toys & Games', 'Lantern Press', 1400, 0, 'book', 6, 3, 'A bedtime story about a train that is never in a hurry.', 'Pages:32|Age:2 to 6'],
    ],
  },
];

export const PENDING_SHOP = {
  owner: { name: 'Nora Lindqvist', email: 'nora@awning.test' }, name: 'Saltwater Supply Co.', color: '#335C67', location: 'Gothenburg, Sweden',
  tagline: 'Swim and beach kit', description: 'Towels, dry bags and swim kit for cold-water swimmers. We are a two-person business and have been trading at local markets for three years.',
  products: [['Changing Robe, Fleece Lined', 'Sports & Outdoors', 'Saltwater', 8900, 0, 'jacket', 1, 12, 'A long, warm robe for changing on a windy beach.', 'Lining:Fleece|Outer:Waterproof']],
};

export const COUPONS = [
  { code: 'WELCOME10', description: '10% off your first order, up to 15.00', type: 'percent', value: 10, maxDiscount: 1500, perCustomerLimit: 1 },
  { code: 'BIGBASKET', description: '10.00 off orders over 80.00', type: 'fixed', value: 1000, minSubtotal: 8000, perCustomerLimit: 0 },
  { code: 'KETTLE15', description: '15% off at Kettle & Crumb over 30.00', type: 'percent', value: 15, minSubtotal: 3000, shop: 'kettle', perCustomerLimit: 0 },
];

export const REVIEW_TEXT = {
  5: [['Exactly as described', 'Arrived quickly and well packed. It feels better made than the price suggests.'], ['Would buy again', 'I have used it every day for a fortnight and have nothing to complain about.'], ['A lovely thing', 'Bought as a gift and ended up keeping it. Ordered a second one.'], ['Better than expected', 'The photos undersell it. Solid, simple and it does the job.']],
  4: [['Very good', 'Does what it says. One mark off because delivery took a day longer than promised.'], ['Happy with it', 'Good quality. The colour is slightly darker than in the pictures.'], ['Solid choice', 'Works well. The packaging could be less wasteful.']],
  3: [['Fine, not special', 'It is okay for the money. I expected a little more from the description.'], ['Mixed feelings', 'The item is decent but mine arrived with a small mark on it.']],
  2: [['Not for me', 'Smaller than I pictured, and the finish scratched within a week.']],
};

export const FIRST_NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hugo', 'Imani', 'Jonas', 'Keiko', 'Liam', 'Mina', 'Noah', 'Olu', 'Paula', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Victor', 'Wren', 'Xavier', 'Yara', 'Zoe', 'Arjun', 'Bianca', 'Callum', 'Dalia', 'Emre', 'Freya', 'Gabriel', 'Hana', 'Idris', 'Jade', 'Kofi', 'Lena', 'Mateo', 'Nia'];
export const LAST_NAMES = ['Adeyemi', 'Baker', 'Costa', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Hussain', 'Ito', 'Jensen', 'Kowalski', 'Lopez', 'Mbeki', 'Nguyen', 'Oyelaran', 'Patel', 'Quigley', 'Rossi', 'Singh', 'Tanaka'];
export const CITIES = [['London', 'UK', 'E2 8AA'], ['Manchester', 'UK', 'M4 1HQ'], ['Dublin', 'Ireland', 'D02 XY45'], ['Berlin', 'Germany', '10115'], ['Amsterdam', 'Netherlands', '1012 AB'], ['Lisbon', 'Portugal', '1100-148'], ['Austin', 'USA', '78701'], ['Toronto', 'Canada', 'M5V 2T6']];
