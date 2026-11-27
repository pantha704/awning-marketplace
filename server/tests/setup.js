// Runs before every test file, before the app is imported.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/awning_test';
process.env.MONGO_MEMORY_FALLBACK = 'true';
process.env.CACHE_DRIVER = process.env.TEST_CACHE_DRIVER || 'memory';
process.env.SEARCH_DRIVER = 'mongo';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = 'storage-test';
process.env.PAYMENT_PROVIDER = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PLATFORM_COMMISSION_PERCENT = '10';
process.env.CURRENCY = 'usd';
process.env.SHIPPING_FLAT = '500';
process.env.FREE_SHIPPING_OVER = '5000';
