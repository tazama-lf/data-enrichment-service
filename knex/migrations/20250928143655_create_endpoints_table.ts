import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('endpoints', (table) => {
    table.string('endpoint_name').notNullable();
    table.string('path').notNullable();
    table.string('description').notNullable();
    table.enu('mode', ['append', 'replace']).notNullable();
    table.string('table_name').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('endpoints');
}
