import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('endpoints', (table) => {
    table.enu('job_status', ['PENDING', 'IN-PROGRESS', 'SUSPENDED', 'CLONED']).notNullable().defaultTo('PENDING');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('endpoints', (table) => {
    table.dropColumn('job_status');
  });
}
