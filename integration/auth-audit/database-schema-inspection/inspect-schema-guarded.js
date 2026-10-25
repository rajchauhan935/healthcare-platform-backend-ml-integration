"use strict";

const path = require("node:path");

const {
  expectedDatabase,
  assertDatabaseName
} = require("./database-name-guard");

const serviceRoots = Object.freeze({
  core: path.resolve(__dirname, "../../../services/core-backend/apps/backend"),
  booking: path.resolve(__dirname, "../../../services/booking-backend"),
  homecare: path.resolve(__dirname, "../../../services/homecare-backend")
});

const service = process.argv[2];

async function inspect() {
  expectedDatabase(service);

  const connectionString = process.env.PG_SCHEMA_INSPECTION_URL;

  if (!connectionString) {
    throw new Error("Inspection connection is not configured");
  }

  const { Client } = require(
    require.resolve("pg", { paths: [serviceRoots[service]] })
  );

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    application_name: "health_platform_guarded_schema_inspection"
  });

  let connected = false;
  let transactionStarted = false;

  try {
    await client.connect();
    connected = true;

    await client.query("BEGIN READ ONLY");
    transactionStarted = true;

    const databaseResult = await client.query(
      "SELECT current_database() AS database_name"
    );

    if (databaseResult.rows.length !== 1) {
      throw new Error("Database identity unavailable");
    }

    assertDatabaseName(
      service,
      databaseResult.rows[0].database_name
    );

    process.stdout.write(
      `DATABASE TARGET VERIFIED: ${service}\n`
    );

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
  } finally {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
    }

    if (connected) {
      await client.end();
    }
  }
}

inspect().catch(() => {
  process.stderr.write(
    "Guarded schema inspection rejected or unavailable.\n"
  );
  process.exitCode = 1;
});
