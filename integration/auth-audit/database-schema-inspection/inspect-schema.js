"use strict";

const path = require("node:path");

const serviceRoots = Object.freeze({
  core: path.resolve(__dirname, "../../../services/core-backend/apps/backend"),
  booking: path.resolve(__dirname, "../../../services/booking-backend"),
  homecare: path.resolve(__dirname, "../../../services/homecare-backend")
});

const service = process.argv[2];

if (!Object.prototype.hasOwnProperty.call(serviceRoots, service)) {
  process.stderr.write("Unsupported service name\n");
  process.exit(1);
}

const { Client } = require(
  require.resolve("pg", { paths: [serviceRoots[service]] })
);

async function inspect() {
  if (!process.env.PG_SCHEMA_INSPECTION_URL) {
    throw new Error("Dedicated inspection connection is not configured");
  }

  const client = new Client({
    connectionString: process.env.PG_SCHEMA_INSPECTION_URL,
    connectionTimeoutMillis: 5000,
    application_name: "health_platform_schema_inspection"
  });

  try {
    await client.connect();

    await client.query("BEGIN READ ONLY");

    const result = await client.query(`
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_name IN ('users', 'identity_mappings', 'account_links')
      ORDER BY table_schema, table_name, ordinal_position
    `);

    for (const row of result.rows) {
      process.stdout.write(
        `${row.table_schema}.${row.table_name} | ` +
        `${row.column_name} | ${row.data_type} | ` +
        `${row.udt_name} | nullable=${row.is_nullable}\n`
      );
    }

    process.stdout.write(
      `SCHEMA METADATA ROWS: ${result.rowCount}\n`
    );

    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

inspect().catch(() => {
  process.stderr.write(
    "Schema inspection unavailable. Check connection configuration privately.\n"
  );
  process.exitCode = 1;
});
