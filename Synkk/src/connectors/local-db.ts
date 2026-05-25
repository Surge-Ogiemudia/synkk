import Database from 'better-sqlite3';

export async function readLocalDatabase(dbPath: string, schema: any) {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Using the schema mapped by Claude to query the correct table and columns
    // This is a dynamic query based on the AI's findings
    const tableName = schema.tableName || 'inventory';
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    
    db.close();

    // Map the raw rows to our standard format using the schema
    const standardizedInventory = rows.map((row: any) => ({
      name: row[schema.nameCol],
      quantity: row[schema.qtyCol],
      price: row[schema.priceCol],
      expiry: schema.expiryCol ? row[schema.expiryCol] : null
    }));

    return standardizedInventory;
  } catch (error) {
    console.error('Failed to read local database:', error);
    throw error;
  }
}
