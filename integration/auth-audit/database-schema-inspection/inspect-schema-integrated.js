"use strict";

const path = require("node:path");

const {
  inspectionConnectionConfig
} = require("./inspection-connection-config");

const {
  assertDatabaseName
} = require("./database-name-guard");

const serviceRoots = Object.freeze({
  core: path.resolve(__dirname, "../../../services/core-backend/apps/backend"),
  booking: path.resolve(__dirname, "../../../services/booking-backend"),
  homecare: path.resolve(__dirname, "../../../services/homecare-backend")
});

async function inspect(service) {
  const config = inspectionConnectionConfig(service);

  const { Client } = require(
    require.resolve("pg", { paths: [serviceRoots[service]] })
  );

  const client = new Client(config);
  let connected = false;
  let transactionStarted = false;

  try {
    await client.connect();
    connected = true;

    await client.query("BEGIN READ ONLY");
    transactionStarted = true;

    const identity = await client.query(`
      SELECT
        current_database() AS database_name,
        current_setting('transaction_read_only') AS read_only,
        r.rolsuper AS is_superuser
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);

    if (identity.rows.length !== 1) {
      throw new Error("Inspection identity unavailable");
    }

    const row = identity.rows[0];

    assertDatabaseName(service, row.database_name);

    if (row.read_only !== "on" || row.is_superuser !== false) {
      throw new Error("Inspection connection safety check failed");
    }

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

    process.stdout.write(`DATABASE VERIFIED: ${service}\n`);

    for (const column of result.rows) {
      process.stdout.write(
        `${column.table_schema}.${column.table_name} | ` +
        `${column.column_name} | ${column.data_type} | ` +
        `${column.udt_name} | nullable=${column.is_nullable}\n`
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

inspect(process.argv[2]).catch(() => {
  process.stderr.write(
    "Integrated schema inspection rejected or unavailable.\n"
  );
  process.exitCode = 1;
});
