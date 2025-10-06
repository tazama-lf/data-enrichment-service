import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.enu('mode', ['append', 'replace']).notNullable().defaultTo('append');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.dropColumn('mode');
  });
}
