import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.integer('schedule_id').unsigned();
    table.foreign('schedule_id').references('schedule.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('job', (table) => {
    table.dropForeign(['schedule_id']);
    table.dropColumn('schedule_id');
  });
}
