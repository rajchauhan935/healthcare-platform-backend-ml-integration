BEGIN READ ONLY;

SELECT
    current_database() AS database_name,
    current_setting('transaction_read_only') AS transaction_read_only,
    current_user AS inspection_role,
    r.rolsuper AS is_superuser,
    r.rolcreatedb AS can_create_database,
    r.rolcreaterole AS can_create_role,
    has_database_privilege(current_user, current_database(), 'CREATE')
        AS can_create_in_database,
    has_database_privilege(current_user, current_database(), 'TEMP')
        AS can_create_temporary_objects,
    has_schema_privilege(current_user, 'public', 'CREATE')
        AS can_create_in_public_schema
FROM pg_catalog.pg_roles AS r
WHERE r.rolname = current_user;

ROLLBACK;
