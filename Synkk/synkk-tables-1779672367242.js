
        const Database = require('better-sqlite3');
        const db = new Database('C:\\Users\\HP\\AppData\\Local\\Programs\\virtualrx\\VirtualRx.exe', { readonly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        console.log(JSON.stringify(tables.map(t => t.name)));
      