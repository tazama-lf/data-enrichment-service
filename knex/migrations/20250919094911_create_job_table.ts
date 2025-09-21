import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('job', (table) => {
    table.increments('id').primary();
    table.enu('config_type', ['Pull', 'Push']).notNullable();
    table.string('endpoint_name').notNullable();
    table.enu('source_type', ['SFTP', 'HTTP']).notNullable();
    table.string('description').notNullable();
    table.jsonb('connection').notNullable();
    table.jsonb('file');
    table.string('table_name').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('job');
}
