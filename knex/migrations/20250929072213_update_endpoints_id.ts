import type { Knex } from 'knex';
import { v4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrichment', (table) => {
    table.dropForeign(['endpoint_id']);
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.string('id').nullable().alter();
  });

  await knex.schema.alterTable('enrichment', (table) => {
    table.string('endpoint_id').nullable().alter();
  });

  const rows = await knex('endpoints').select('id');
  for (const row of rows) {
    const newId = v4();
    await knex('endpoints').where({ id: row.id }).update({ id: newId });
    await knex('enrichment').where({ endpoint_id: row.id }).update({ endpoint_id: newId });
  }

  await knex.schema.alterTable('endpoints', (table) => {
    table.string('id').notNullable().alter();
    table.primary(['id']);
  });

  await knex.schema.alterTable('enrichment', (table) => {
    table.foreign('endpoint_id').references('id').inTable('endpoints').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrichment', (table) => {
    table.dropForeign(['endpoint_id']);
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.increments('id').alter();
    table.primary(['id']);
  });

  await knex.schema.alterTable('enrichment', (table) => {
    table.integer('endpoint_id').alter();
    table.foreign('endpoint_id').references('id').inTable('endpoints').onDelete('CASCADE');
  });
}
