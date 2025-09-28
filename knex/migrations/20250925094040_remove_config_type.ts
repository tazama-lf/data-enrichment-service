import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.dropColumn('config_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.enu('config_type', ['Pull', 'Push']).notNullable();
  });
}
