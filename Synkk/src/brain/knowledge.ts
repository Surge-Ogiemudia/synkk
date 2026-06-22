import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/synkk_db';
const client = new MongoClient(uri);

let dbPromise = client.connect().then(c => c.db()).catch(err => {
  console.error('[KnowledgeBase] MongoDB connection failed:', err.message);
  return null;
});

export async function getKnowledgeBaseEntry(posIdentifier: string) {
  try {
    const db = await dbPromise;
    const collection = db.collection('knowledge_base');
    console.log(`Checking knowledge base for ${posIdentifier}...`);
    const entry = await collection.findOne({ posIdentifier });
    return entry;
  } catch (error) {
    console.error('Error fetching from knowledge base:', error);
    return null;
  }
}

export async function updateKnowledgeBase(posData: any) {
  try {
    const db = await dbPromise;
    const collection = db.collection('knowledge_base');
    console.log(`Saving learnings to knowledge base for ${posData.posIdentifier}...`);
    
    await collection.updateOne(
      { posIdentifier: posData.posIdentifier },
      { $set: { ...posData, lastUpdated: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('Error updating knowledge base:', error);
    return false;
  }
}

export async function getAllKnowledge() {
  try {
    const db = await dbPromise;
    const collection = db.collection('knowledge_base');
    // Fetch up to 10 latest schemas to avoid blowing up the LLM context window
    const entries = await collection.find({}).sort({ lastUpdated: -1 }).limit(10).toArray();
    return entries.map(e => e.schemaMapping).filter(Boolean);
  } catch (error) {
    console.error('Error fetching global knowledge:', error);
    return [];
  }
}
