import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('enrichment', (table) => {
    table.increments('id').primary();
    table.string('tenant_id ').notNullable();
    table.string('data').notNullable();
    table.uuid('correlation_id').notNullable();
    table.string('checksum').notNullable();
    table.integer('endpoint_id').unsigned();
    table.foreign('endpoint_id').references('endpoints.id').onDelete('CASCADE');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('enrichment');
}
