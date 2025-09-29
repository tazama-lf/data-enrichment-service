import type { Knex } from 'knex';
import { v4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('job', (table) => {
    table.string('id').nullable().alter();
  });

  const rows = await knex('job').select('id');
  for (const row of rows) {
    await knex('job').where({ id: row.id }).update({ id: v4() });
  }

  await knex.schema.alterTable('job', (table) => {
    table.string('id').notNullable().alter();
    table.primary(['id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.dropPrimary();
    table.increments('id').alter();
    table.primary(['id']);
  });
}
