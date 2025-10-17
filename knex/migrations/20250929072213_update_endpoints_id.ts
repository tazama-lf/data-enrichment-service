import type { Knex } from 'knex';
import { v4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('endpoints', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.string('id').nullable().alter();
  });

  const rows = await knex('endpoints').select('id');
  for (const row of rows) {
    const newId = v4();
    await knex('endpoints').where({ id: row.id }).update({ id: newId });
  }

  await knex.schema.alterTable('endpoints', (table) => {
    table.string('id').notNullable().alter();
    table.primary(['id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('endpoints', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('endpoints', (table) => {
    table.increments('id').alter();
    table.primary(['id']);
  });
}
