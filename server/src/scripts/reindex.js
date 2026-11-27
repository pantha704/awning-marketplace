/** Rebuild the Elasticsearch product index from MongoDB:  npm run reindex */
import { connectDb, disconnectDb } from '../db.js';
import { initSearch, reindexAll, searchInfo } from '../services/search/index.js';

try {
  await connectDb();
  await initSearch();
  if (searchInfo.driver !== 'elasticsearch') {
    console.log('Search is running on the MongoDB fallback, so there is no index to rebuild. Set ELASTICSEARCH_URL first (SETUP_GUIDE.md step B4).');
  } else {
    const result = await reindexAll();
    console.log(`Indexed ${result.indexed} products into Elasticsearch (${searchInfo.detail}).`);
  }
} catch (err) {
  console.error('Reindex failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
