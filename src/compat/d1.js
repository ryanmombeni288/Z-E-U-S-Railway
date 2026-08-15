function replaceNoCase(sql) {
  return sql.replace(/username\s*=\s*\?\s+COLLATE\s+NOCASE/gi, "LOWER(username) = LOWER(?)");
}

function replacePlaceholders(sql) {
  let output = "";
  let index = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      output += char;
      if (char === quote) {
        if (sql[i + 1] === quote) {
          output += sql[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
    } else if (char === "?") {
      index += 1;
      output += `$${index}`;
    } else {
      output += char;
    }
  }
  return output;
}

export function translateKnownZeusSql(input) {
  let sql = String(input || "").trim();
  if (!sql) throw new TypeError("SQL is required");

  if (/^PRAGMA\s+table_info\(users\)$/i.test(sql)) {
    return {
      text: "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position",
      kind: "pragma",
    };
  }

  if (/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users\b/i.test(sql) && /AUTOINCREMENT/i.test(sql)) {
    sql = sql
      .replace(/id\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i, "id BIGSERIAL PRIMARY KEY")
      .replace(/\bREAL\b/gi, "DOUBLE PRECISION");
  }

  if (/^INSERT\s+OR\s+REPLACE\s+INTO\s+settings\s*\(/i.test(sql)) {
    sql = sql.replace(/^INSERT\s+OR\s+REPLACE/i, "INSERT");
    sql += " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
  }

  sql = replaceNoCase(sql);
  return { text: replacePlaceholders(sql), kind: "query" };
}

class D1PreparedStatement {
  constructor(adapter, sql, values = []) {
    this.adapter = adapter;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1PreparedStatement(this.adapter, this.sql, values);
  }

  async execute(queryable = this.adapter.queryable) {
    const translated = translateKnownZeusSql(this.sql);
    return queryable.query(translated.text, this.values);
  }

  async first(column) {
    const result = await this.execute();
    const row = result.rows[0] ?? null;
    return column && row ? row[column] ?? null : row;
  }

  async all() {
    const result = await this.execute();
    return { success: true, results: result.rows, meta: { changes: result.rowCount ?? 0 } };
  }

  async run() {
    const result = await this.execute();
    return {
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
        last_row_id: result.rows?.[0]?.id ?? null,
      },
      results: result.rows || [],
    };
  }
}

export class D1PostgresAdapter {
  constructor(queryable) {
    if (!queryable?.query) throw new TypeError("A pg-compatible queryable is required");
    this.queryable = queryable;
  }

  prepare(sql) {
    return new D1PreparedStatement(this, sql);
  }

  async batch(statements) {
    if (!Array.isArray(statements)) throw new TypeError("batch expects an array");
    const client = this.queryable.connect ? await this.queryable.connect() : this.queryable;
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        if (!(statement instanceof D1PreparedStatement)) throw new TypeError("Invalid D1 statement");
        const result = await statement.execute(client);
        results.push({ success: true, results: result.rows || [], meta: { changes: result.rowCount ?? 0 } });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release?.();
    }
  }
}
